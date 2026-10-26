import { computed, reactive, readonly, ref, shallowRef } from 'vue';
import type { ArticleListItem, ArticleListKind, ArticleStateValue, ArticleSource } from '@it-discovery/contracts';
import { ArticleOpeningError, type ArticleOpeningModel } from '../../articles/models/article-opening.model';
import type { ArticleListModel } from '../models/article-list.model';
import { ArticleStateError, type ArticleField, type ArticleStateModel } from '../../articles/models/article-state.model';
import { PullToRefreshGesture, type PullGestureInput } from '../models/pull-to-refresh-gesture';

type LoadMode = 'initial' | 'refresh' | 'append';
type SavePhase = ArticleField | 'checking';
interface ListError { mode: LoadMode; message: string }
interface SaveError { message: string; uncertain: boolean }
interface ReadStatus { phase: 'saving' | 'failed' | 'uncertain'; openedAt: string; message: string }

// 一覧VMが画面状態と操作の進行を持つ。Modelから返った値をここで表示状態へ反映する。
export function useArticleListViewModel(list: ArticleListModel, state: ArticleStateModel, opening: ArticleOpeningModel) {
  // shallowRefは配列の置き換えを描画へ通知する。記事の変更も新しい配列で反映する。
  const articles = shallowRef<ArticleListItem[]>([]);
  // refは画面へ通知する値。内部の続き位置・要求番号は下の通常変数へ分ける。
  const selectedKind = ref<ArticleListKind>('all');
  const selectedSourceId = ref<string | null>(null);
  // 現在の20件とは独立した選択肢。記事が0件の取得先も選択できる。
  const sources = shallowRef<ArticleSource[]>([]);
  const sourcesLoading = ref(false);
  const sourcesError = ref<string | null>(null);
  let sourcesController: AbortController | null = null;
  const hasMore = ref(false);
  const listLoading = ref<LoadMode | null>(null);
  const listError = ref<ListError | null>(null);
  // reactiveなMapは記事ごとの追加・削除を描画へ通知する。別記事の保存は独立する。
  const savingByArticle = reactive(new Map<number, SavePhase>());
  const saveErrors = reactive(new Map<number, SaveError>());
  // 開いた事実とDB保存の成否を分ける。失敗時も実際に開いた記事を未読表示へ戻さない。
  const openingErrors = reactive(new Map<number, string>());
  const readStatus = reactive(new Map<number, ReadStatus>());
  const locallyOpened = new Map<number, string>();
  const readControllers = new Map<number, AbortController>();
  const notice = ref<string | null>(null);

  // 続き位置は描画しないので普通の変数。画面ごとに持ち、切り替え時にリセットする。
  let nextCursor: string | null = null;
  let initialized = false;
  let disposed = false;
  let generation = 0;
  let loadController: AbortController | null = null;
  const saveControllers = new Map<number, AbortController>();
  // フィルター変更で表示配列が空になっても、保存前の確定状態を失わない。
  const savingStates = new Map<number, ArticleStateValue>();
  // 保存後に届く古い一覧応答で状態を戻さないための、画面内だけの変更記録。
  let stateVersion = 0;
  const confirmedStates = new Map<number, { version: number; state: ArticleStateValue }>();
  const removedArticles = new Set<number>();
  // computedは既存状態から導く値。追加取得可能かを別の書き換え対象として保存しない。
  const canLoadMore = computed(() => !disposed && hasMore.value && listLoading.value === null && listError.value === null);

  function matches(article: ArticleListItem): boolean {
    return !removedArticles.has(article.articleId)
      && (selectedSourceId.value === null || article.source.sourceId === selectedSourceId.value)
      && (selectedKind.value === 'all' || article.state.interested);
  }

  async function loadPage(mode: LoadMode): Promise<void> {
    if (disposed) return;
    // 中止が間に合わない応答も、世代番号の比較で表示へ入れない。
    const requestGeneration = ++generation;
    const readVersion = stateVersion;
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    listLoading.value = mode;
    listError.value = null;
    try {
      const page = await list.getPage(selectedKind.value, mode === 'append' ? nextCursor ?? undefined : undefined, controller.signal, selectedSourceId.value ?? undefined);
      if (disposed || requestGeneration !== generation) return;
      const items = new Map((mode === 'append' ? articles.value : []).map(article => [article.articleId, article]));
      for (const fetched of page.articles) {
        const newer = confirmedStates.get(fetched.articleId);
        // この取得より後で確認した状態だけを優先する。次回の新しい取得はサーバーを読む。
        // 保存途中の一覧応答でも登録状態を先取りせず、保存結果が返るまで確定表示を保つ。
        const pending = savingStates.get(fetched.articleId);
        const article = pending ? { ...fetched, state: { ...pending } }
          : newer && newer.version > readVersion ? { ...fetched, state: { ...newer.state } } : fetched;
        items.set(article.articleId, { ...article, state: withLocalRead(article.articleId, article.state) });
      }
      articles.value = [...items.values()].filter(matches).sort((a, b) =>
        Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt) || b.articleId - a.articleId);
      nextCursor = page.nextCursor;
      hasMore.value = page.hasMore;
    } catch {
      if (disposed || requestGeneration !== generation) return;
      listError.value = { mode, message: mode === 'append' ? '続きを取得できませんでした。'
        : mode === 'refresh' ? '一覧を更新できませんでした。' : '一覧を取得できませんでした。' };
    } finally {
      if (!disposed && requestGeneration === generation) {
        listLoading.value = null;
        loadController = null;
      }
    }
  }

  function initialize(): Promise<void> {
    if (initialized || disposed) return Promise.resolve();
    initialized = true;
    return Promise.all([loadPage('initial'), loadSources()]).then(() => undefined);
  }
  async function loadSources(): Promise<void> {
    if (disposed || sourcesLoading.value) return;
    sourcesLoading.value = true; sourcesError.value = null;
    const controller = new AbortController(); sourcesController = controller;
    try {
      const result = await list.getSources(controller.signal);
      if (!disposed) sources.value = result;
    } catch {
      if (!disposed) sourcesError.value = '取得先を読み込めませんでした。';
    } finally {
      if (!disposed) sourcesLoading.value = false;
      sourcesController = null;
    }
  }
  function changeSource(sourceId: string | null): Promise<void> {
    if (disposed || sourceId === selectedSourceId.value
      || (sourceId !== null && !sources.value.some(source => source.sourceId === sourceId))) return Promise.resolve();
    selectedSourceId.value = sourceId;
    return resetList();
  }
  function refreshArticles(): Promise<void> {
    if (listLoading.value === 'initial' || listLoading.value === 'refresh') return Promise.resolve();
    return loadPage(articles.value.length ? 'refresh' : 'initial');
  }
  function changeListKind(kind: ArticleListKind): Promise<void> {
    if (disposed || kind === selectedKind.value) return Promise.resolve();
    selectedKind.value = kind;
    return resetList();
  }
  function resetList(): Promise<void> {
    cancelPull();
    articles.value = [];
    nextCursor = null;
    hasMore.value = false;
    return loadPage('initial');
  }
  function loadMoreArticles(): Promise<void> {
    return canLoadMore.value && nextCursor ? loadPage('append') : Promise.resolve();
  }
  function retryArticleLoad(): Promise<void> {
    return listError.value ? loadPage(listError.value.mode) : Promise.resolve();
  }

  function withLocalRead(articleId: number, value: ArticleStateValue): ArticleStateValue {
    const openedAt = locallyOpened.get(articleId);
    return openedAt && (!value.lastOpenedAt || Date.parse(openedAt) > Date.parse(value.lastOpenedAt))
      ? { ...value, lastOpenedAt: openedAt } : value;
  }
  function showOpened(articleId: number, openedAt: string): void {
    const previous = locallyOpened.get(articleId);
    if (!previous || Date.parse(openedAt) > Date.parse(previous)) locallyOpened.set(articleId, openedAt);
    articles.value = articles.value.map(article => article.articleId === articleId
      ? { ...article, state: withLocalRead(articleId, article.state) } : article);
  }

  async function finishReadSave(articleId: number, openedAt: string, controller: AbortController, saved: Promise<ArticleStateValue>): Promise<void> {
    try {
      const confirmed = await saved;
      if (disposed || readControllers.get(articleId) !== controller) return;
      // 同時に保存したピン・気になるを古い応答で戻さない。既読の保存結果だけを使う。
      if (!confirmed.lastOpenedAt || Date.parse(confirmed.lastOpenedAt) < Date.parse(openedAt)) throw new ArticleStateError('uncertain');
      showOpened(articleId, confirmed.lastOpenedAt);
      readStatus.delete(articleId);
    } catch (error) {
      if (disposed || readControllers.get(articleId) !== controller) return;
      const uncertain = !(error instanceof ArticleStateError) || error.kind === 'uncertain';
      readStatus.set(articleId, { phase: uncertain ? 'uncertain' : 'failed', openedAt,
        message: error instanceof ArticleStateError && error.kind === 'missing'
          ? '記事がサーバーに存在しないため既読を保存できませんでした。'
          : uncertain ? '既読の保存結果を確認できませんでした。' : '既読を保存できませんでした。' });
    } finally {
      if (readControllers.get(articleId) === controller) readControllers.delete(articleId);
    }
  }
  async function openArticle(articleId: number): Promise<void> {
    if (disposed) return;
    const article = articles.value.find(item => item.articleId === articleId);
    if (!article) return;
    let openedAt: string;
    try {
      // この前にawaitを置かない。ブラウザのユーザー操作の有効期間内に新規タブを作る。
      openedAt = opening.open(article.url);
    } catch (error) {
      openingErrors.set(articleId, error instanceof ArticleOpeningError ? error.message : '記事を開けませんでした。');
      return;
    }
    openingErrors.delete(articleId);
    readControllers.get(articleId)?.abort();
    const controller = new AbortController();
    readControllers.set(articleId, controller);
    showOpened(articleId, openedAt);
    readStatus.set(articleId, { phase: 'saving', openedAt, message: '既読を保存中' });
    await finishReadSave(articleId, openedAt, controller, state.recordOpened(articleId, openedAt, controller.signal));
  }
  async function retryReadSave(articleId: number): Promise<void> {
    const failed = readStatus.get(articleId);
    if (disposed || !failed || failed.phase === 'saving') return;
    const controller = new AbortController();
    readControllers.set(articleId, controller);
    readStatus.set(articleId, { ...failed, phase: 'saving', message: '既読を保存中' });
    // 利用者が押した時だけ同じ日時で再試行する。永続キュー・タイマーは持たない。
    await finishReadSave(articleId, failed.openedAt, controller, state.recordOpened(articleId, failed.openedAt, controller.signal));
  }

  function confirmState(articleId: number, confirmed: ArticleStateValue, source?: ArticleListItem): void {
    confirmedStates.set(articleId, { version: ++stateVersion, state: { ...confirmed } });
    const displayState = withLocalRead(articleId, confirmed);
    const updated = articles.value.map(article => article.articleId === articleId
      ? { ...article, state: { ...displayState } } : article);
    // 保存途中で気になる一覧へ移った場合、成功した対象記事をその一覧へ反映する。
    if (source && selectedKind.value === 'interested' && confirmed.interested && !updated.some(article => article.articleId === articleId)) {
      updated.push({ ...source, state: { ...displayState } });
    }
    articles.value = updated.filter(matches).sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt) || b.articleId - a.articleId);
  }
  function removeArticle(articleId: number): void {
    removedArticles.add(articleId);
    articles.value = articles.value.filter(article => article.articleId !== articleId);
    saveErrors.delete(articleId);
    notice.value = '記事がサーバーに存在しないため、一覧から除きました。';
  }

  async function checkState(articleId: number, signal: AbortSignal, source?: ArticleListItem): Promise<void> {
    savingByArticle.set(articleId, 'checking');
    try {
      const confirmed = await state.getState(articleId, signal);
      if (disposed) return;
      confirmState(articleId, confirmed, source);
      // GETは現在の状態の確認。元の保存要求の成功を証明するものではない。
      saveErrors.set(articleId, { uncertain: false, message: '保存の応答を確認できなかったため、現在の状態を取得しました。表示をご確認ください。' });
    } catch (error) {
      if (disposed) return;
      if (error instanceof ArticleStateError && error.kind === 'missing') removeArticle(articleId);
      else saveErrors.set(articleId, { uncertain: true, message: '保存結果と現在の状態を確認できません。接続を確認し「状態を確認」を押してください。' });
    }
  }

  async function toggleField(articleId: number, field: ArticleField): Promise<void> {
    if (disposed || savingByArticle.has(articleId) || saveErrors.get(articleId)?.uncertain) return;
    const article = articles.value.find(article => article.articleId === articleId);
    if (!article) return;
    const controller = new AbortController();
    saveControllers.set(articleId, controller);
    savingStates.set(articleId, { ...article.state });
    savingByArticle.set(articleId, field);
    saveErrors.delete(articleId);
    try {
      // 登録値は成功するまで変えない。ViewはsavingByArticleから部分着色する。
      const confirmed = await state.setField(articleId, field, !article.state[field], controller.signal);
      if (!disposed) confirmState(articleId, confirmed, article);
    } catch (error) {
      if (disposed) return;
      if (error instanceof ArticleStateError && error.kind === 'missing') removeArticle(articleId);
      else if (error instanceof ArticleStateError && error.kind === 'rejected') {
        saveErrors.set(articleId, { uncertain: false, message: '変更が受け付けられませんでした。接続やログイン状態をご確認ください。' });
      } else {
        // 更新要求を再送せず、現在状態のGETだけを一回行う。
        await checkState(articleId, controller.signal, article);
      }
    } finally {
      saveControllers.delete(articleId);
      savingStates.delete(articleId);
      if (!disposed) savingByArticle.delete(articleId);
    }
  }
  function togglePin(articleId: number): Promise<void> { return toggleField(articleId, 'pinned'); }
  function toggleInterest(articleId: number): Promise<void> { return toggleField(articleId, 'interested'); }
  async function retryStateCheck(articleId: number): Promise<void> {
    if (disposed || savingByArticle.has(articleId) || !saveErrors.get(articleId)?.uncertain) return;
    const controller = new AbortController();
    saveControllers.set(articleId, controller);
    try { await checkState(articleId, controller.signal); }
    finally { saveControllers.delete(articleId); if (!disposed) savingByArticle.delete(articleId); }
  }

  const pullGesture = reactive(new PullToRefreshGesture());
  const pullDistance = computed(() => pullGesture.distance);
  const pullReady = computed(() => pullGesture.ready);
  function canPull(): boolean { return !disposed && listLoading.value !== 'initial' && listLoading.value !== 'refresh'; }
  function beginPull(input: PullGestureInput): void { pullGesture.begin(input, canPull()); }
  function movePull(input: PullGestureInput): boolean { return pullGesture.move(input, canPull()); }
  async function finishPull(): Promise<void> { if (pullGesture.finish(canPull())) await refreshArticles(); }
  function cancelPull(): void { pullGesture.cancel(); }
  function dispose(): void {
    disposed = true;
    generation++;
    loadController?.abort(); sourcesController?.abort();
    for (const controller of saveControllers.values()) controller.abort();
    for (const controller of readControllers.values()) controller.abort();
    cancelPull();
  }

  return { articles: readonly(articles), selectedKind: readonly(selectedKind), selectedSourceId: readonly(selectedSourceId),
    sources: readonly(sources), sourcesLoading: readonly(sourcesLoading), sourcesError: readonly(sourcesError), changeSource, loadSources,
    hasMore: readonly(hasMore),
    listLoading: readonly(listLoading), listError: readonly(listError), canLoadMore,
    openingErrors: readonly(openingErrors), readStatus: readonly(readStatus), savingByArticle: readonly(savingByArticle), saveErrors: readonly(saveErrors), notice: readonly(notice),
    initialize, refreshArticles, changeListKind, loadMoreArticles, retryArticleLoad,
    openArticle, retryReadSave, togglePin, toggleInterest, retryStateCheck, pullDistance, pullReady, beginPull, movePull, finishPull, cancelPull, dispose };
}
export type ArticleListViewModel = ReturnType<typeof useArticleListViewModel>;
