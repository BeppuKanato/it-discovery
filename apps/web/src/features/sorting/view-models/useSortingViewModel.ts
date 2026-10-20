import { computed, reactive, readonly, ref, shallowRef } from 'vue';
import type { ArticleStateValue } from '@it-discovery/contracts';
import type { SortingModel } from '../models/sorting.model';
import { SortingSession, type SortingDecision } from '../models/sorting-session';
import { SwipeGesture } from '../models/swipe-gesture';
import { ArticleOpeningError, type ArticleOpeningModel } from '../../articles/models/article-opening.model';
import { ArticleStateError, type ArticleStateModel } from '../../articles/models/article-state.model';

interface ReadStatus { phase: 'saving' | 'failed' | 'uncertain'; openedAt: string; message: string }

export function useSortingViewModel(model: SortingModel, opening: ArticleOpeningModel, state: ArticleStateModel) {
  // 画面の持ち主はVM。Sessionはその回の値一つとして保持し、判断時に置き換える。
  const session = shallowRef<SortingSession | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const openingError = ref<string | null>(null);
  const readStatus = reactive(new Map<number, ReadStatus>());
  const gesture = reactive(new SwipeGesture());
  const readControllers = new Map<number, AbortController>();
  let loadController: AbortController | null = null;
  let disposed = false;
  let initialized = false;

  // 位置・件数・完了・仮登録IDはSessionから求める。別の書き換え対象にはしない。
  const currentArticle = computed(() => session.value?.current ?? null);
  const total = computed(() => session.value?.cards.length ?? 0);
  const processedCount = computed(() => session.value?.history.length ?? 0);
  const interestedIds = computed(() => session.value?.interestedIds ?? []);
  const complete = computed(() => session.value?.complete ?? false);
  const canUndo = computed(() => !loading.value && processedCount.value > 0);
  const canJudge = computed(() => !loading.value && !!currentArticle.value && currentArticle.value.state.lastOpenedAt === null);
  const canNext = computed(() => !loading.value && !!currentArticle.value?.state.lastOpenedAt);
  // 一括保存はIssue #15。仮選択を捨てて「終了済み」とする経路を作らない。
  const canExit = computed(() => !loading.value && interestedIds.value.length === 0);
  const swipeOffset = computed(() => gesture.offset);
  const currentReadStatus = computed(() => currentArticle.value ? readStatus.get(currentArticle.value.articleId) : undefined);

  async function loadCandidates(): Promise<void> {
    if (disposed || loading.value || session.value) return;
    loading.value = true; error.value = null;
    const controller = new AbortController(); loadController = controller;
    try {
      const result = await model.getCandidates(controller.signal);
      if (!disposed) session.value = result.articles.length ? SortingSession.start(result.articles) : null;
    } catch {
      if (!disposed) error.value = '仕分け対象を取得できませんでした。';
    } finally {
      if (!disposed) loading.value = false;
      loadController = null;
    }
  }
  function initialize(): Promise<void> {
    if (initialized || disposed) return Promise.resolve();
    initialized = true; return loadCandidates();
  }
  function decide(kind: SortingDecision): void {
    if (disposed || loading.value || !session.value) return;
    session.value = session.value.decide(kind);
    openingError.value = null; gesture.cancel();
  }
  function undo(): void {
    if (disposed || !canUndo.value || !session.value) return;
    session.value = session.value.undo(); openingError.value = null; gesture.cancel();
  }
  function beginSwipe(x: number, y: number): void { if (!disposed && canJudge.value) gesture.begin(x, y); }
  function moveSwipe(x: number, y: number): boolean {
    if (disposed || !canJudge.value) { gesture.cancel(); return false; }
    return gesture.move(x, y);
  }
  function finishSwipe(): void {
    const result = gesture.finish();
    if (!disposed && canJudge.value && result) decide(result);
  }
  function cancelSwipe(): void { gesture.cancel(); }

  async function finishRead(articleId: number, openedAt: string, controller: AbortController, saved: Promise<ArticleStateValue>): Promise<void> {
    try {
      const confirmed = await saved;
      if (disposed || readControllers.get(articleId) !== controller) return;
      if (!confirmed.lastOpenedAt || Date.parse(confirmed.lastOpenedAt) < Date.parse(openedAt)) throw new ArticleStateError('uncertain');
      // 保存中に次へ進んだり戻したりしていても、記事IDで既読だけを反映する。
      session.value = session.value?.markOpened(articleId, confirmed.lastOpenedAt) ?? null;
      readStatus.delete(articleId);
    } catch (failure) {
      if (disposed || readControllers.get(articleId) !== controller) return;
      readStatus.set(articleId, { phase: failure instanceof ArticleStateError && failure.kind !== 'uncertain' ? 'failed' : 'uncertain', openedAt,
        message: failure instanceof ArticleStateError && failure.kind === 'missing'
          ? '記事がサーバーに存在しないため既読を保存できませんでした。'
          : '既読の保存を確認できませんでした。開いた表示はこの画面内に残します。' });
    } finally { if (readControllers.get(articleId) === controller) readControllers.delete(articleId); }
  }
  async function openCurrentArticle(): Promise<void> {
    const article = currentArticle.value;
    if (disposed || !article || !session.value) return;
    let openedAt: string;
    try {
      // タブ作成前にawaitを置かない。元記事への移動は既読保存の応答を待たない。
      openedAt = opening.open(article.url);
    } catch (failure) {
      openingError.value = failure instanceof ArticleOpeningError ? failure.message : '記事を開けませんでした。';
      return;
    }
    openingError.value = null; gesture.cancel();
    session.value = session.value.markOpened(article.articleId, openedAt);
    readControllers.get(article.articleId)?.abort();
    const controller = new AbortController(); readControllers.set(article.articleId, controller);
    readStatus.set(article.articleId, { phase: 'saving', openedAt, message: '既読を保存中' });
    await finishRead(article.articleId, openedAt, controller, state.recordOpened(article.articleId, openedAt, controller.signal));
  }
  async function retryReadSave(): Promise<void> {
    const article = currentArticle.value;
    const status = article && readStatus.get(article.articleId);
    if (disposed || !article || !status || status.phase === 'saving') return;
    const controller = new AbortController(); readControllers.set(article.articleId, controller);
    readStatus.set(article.articleId, { ...status, phase: 'saving', message: '既読を保存中' });
    await finishRead(article.articleId, status.openedAt, controller, state.recordOpened(article.articleId, status.openedAt, controller.signal));
  }
  function dispose(): void {
    disposed = true; loadController?.abort();
    for (const controller of readControllers.values()) controller.abort();
    gesture.cancel();
  }
  return { loading: readonly(loading), error: readonly(error), openingError: readonly(openingError),
    currentArticle: readonly(currentArticle), currentReadStatus: readonly(currentReadStatus),
    total, processedCount, interestedIds: readonly(interestedIds), complete, canUndo, canJudge, canNext, canExit, swipeOffset,
    initialize, retryLoading: loadCandidates, decide, undo, beginSwipe, moveSwipe, finishSwipe, cancelSwipe,
    openCurrentArticle, retryReadSave, dispose };
}
