import { InterestBatchError, type InterestBatchSyncModel } from '../models/interest-batch-sync.model';
import type { PendingInterestBatch } from '../models/pending-interest';
import { computed, reactive, readonly, ref, shallowRef } from 'vue';
import type { ArticleListItem, ArticleStateValue } from '@it-discovery/contracts';
import type { PendingInterestModel } from '../models/pending-interest.model';
import type { SortingModel } from '../models/sorting.model';
import { SortingSession, type SortingDecision } from '../models/sorting-session';
import { SwipeGesture } from '../models/swipe-gesture';
import { ArticleOpeningError, type ArticleOpeningModel } from '../../articles/models/article-opening.model';
import { ArticleStateError, type ArticleStateModel } from '../../articles/models/article-state.model';

interface ReadStatus { phase: 'saving' | 'failed' | 'uncertain'; openedAt: string; message: string }

export function useSortingViewModel(model: SortingModel, opening: ArticleOpeningModel, state: ArticleStateModel, pending: PendingInterestModel, batchSync: InterestBatchSyncModel) {
  // 画面の持ち主はVM。Sessionはその回の値一つとして保持し、判断時に置き換える。
  const session = shallowRef<SortingSession | null>(null);
  const loading = ref(false);
  const finishStarted = ref(false);
  const finishing = ref(false);
  const finished = ref(false);
  const finishError = ref<string | null>(null);
  const finishBlocked = ref(false);
  const missingIds = ref<number[]>([]);
  let frozenBatch: PendingInterestBatch | null = null;
  let finishController: AbortController | null = null;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let online = true;
  const pendingWrites = ref(0);
  const storageError = ref<string | null>(null);
  const error = ref<string | null>(null);
  const openingError = ref<string | null>(null);
  const readStatus = reactive(new Map<number, ReadStatus>());
  const gesture = reactive(new SwipeGesture());
  // 退出中は現在のカードを描画したまま操作を止める。通信や端末保存はアニメーションを待たせない。
  const departing = ref<'interested' | 'skipped' | null>(null);
  let departureTimer: ReturnType<typeof setTimeout> | undefined;
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
  const canUndo = computed(() => !loading.value && !departing.value && !finishStarted.value && !storageError.value && processedCount.value > 0);
  const canJudge = computed(() => !loading.value && !departing.value && !finishStarted.value && !storageError.value && !!currentArticle.value && currentArticle.value.state.lastOpenedAt === null);
  const canNext = computed(() => !loading.value && !departing.value && !finishStarted.value && !storageError.value && !!currentArticle.value?.state.lastOpenedAt);
  const canExit = computed(() => !loading.value && !departing.value && !finishing.value && !finished.value && !missingIds.value.length && !storageError.value);
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
  function initialize(initialCandidates?: readonly ArticleListItem[]): Promise<void> {
    if (initialized || disposed) return Promise.resolve();
    initialized = true;
    if (initialCandidates) {
      session.value = initialCandidates.length ? SortingSession.start(initialCandidates) : null;
      return Promise.resolve();
    }
    return loadCandidates();
  }
  function decide(kind: SortingDecision): void {
    if (disposed || loading.value || departing.value || finishStarted.value || storageError.value || !session.value) return;
    const next = session.value.decide(kind);
    if (next === session.value) return;
    session.value = next; persistSelection();
    openingError.value = null; gesture.cancel();
  }
  function undo(): void {
    if (disposed || !canUndo.value || !session.value) return;
    session.value = session.value.undo(); persistSelection(); openingError.value = null; gesture.cancel();
  }
  function persistSelection(): void {
    pendingWrites.value++;
    // 画面を先へ進めてから非同期で保存する。失敗を検知したら以降の判断を止める。
    void pending.update(interestedIds.value).catch(() => {
      if (!disposed) storageError.value = '気になるを端末へ保存できませんでした。最新の選択を残して操作を停止しています。';
    }).finally(() => { if (!disposed) pendingWrites.value--; });
  }
  async function retryPending(): Promise<void> {
    if (disposed || pendingWrites.value) return;
    pendingWrites.value++;
    try { await pending.retry(); if (!disposed) storageError.value = null; }
    catch { if (!disposed) storageError.value = '端末保存に失敗しました。保存前に閉じると最新の変更が失われる場合があります。'; }
    finally { if (!disposed) pendingWrites.value--; }
  }
  async function prepareExit(): Promise<boolean> {
    try { await pending.flush(); return !disposed; }
    catch { if (!disposed) storageError.value = '最新の選択を端末へ保存できていません。再試行してください。'; return false; }
  }
  function cancelFinishTimer(): void { if (finishTimer) clearTimeout(finishTimer); finishTimer = undefined; }
  async function finishSorting(): Promise<void> {
    if (disposed || departing.value || finishing.value || finished.value || missingIds.value.length) return;
    cancelFinishTimer(); finishStarted.value = true; finishing.value = true; finishError.value = null; gesture.cancel();
    const controller = new AbortController(); finishController = controller;
    try {
      // 最終の端末保存が終わってから固定した集合を送る。以降は判断・戻すを再開しない。
      frozenBatch ??= await pending.flush();
      if (disposed) return;
      if (!frozenBatch) { finished.value = true; return; }
      const result = await batchSync.send(frozenBatch,controller.signal);
      if (disposed) return;
      missingIds.value = result.results.filter(item => item.status === 'missing').map(item=>item.articleId);
      if (missingIds.value.length) return;
      await batchSync.acknowledge(frozenBatch);
      if (!disposed) finished.value = true;
    } catch (failure) {
      if (disposed) return;
      finishBlocked.value = (failure instanceof InterestBatchError && failure.kind === 'blocked') || (!frozenBatch && storageError.value !== null);
      finishError.value = failure instanceof InterestBatchError ? failure.message : '端末の保存・完了記録を確認できません。記録を残して再試行します。';
      if (!finishBlocked.value && online) {
        const delay = Math.min(30,2 ** Math.min(attempts++,5)) * 1000;
        finishTimer = setTimeout(() => { void finishSorting(); },delay);
      }
    } finally { if (!disposed) finishing.value = false; finishController = null; }
  }
  async function acknowledgeMissing(): Promise<void> {
    if (disposed || finishing.value || !frozenBatch || !missingIds.value.length) return;
    finishing.value = true;
    try { await batchSync.acknowledge(frozenBatch); if (!disposed) finished.value = true; }
    catch { if (!disposed) finishError.value = '端末の完了記録を削除できませんでした。再度確認してください。'; }
    finally { if (!disposed) finishing.value = false; }
  }
  function setOnline(value: boolean): void {
    online = value;
    if (!online) cancelFinishTimer();
    else if (finishStarted.value && finishError.value && !finishBlocked.value && !finishing.value) void finishSorting();
  }
  function beginSwipe(x: number, y: number): void { if (!disposed && canJudge.value) gesture.begin(x, y); }
  function moveSwipe(x: number, y: number): boolean {
    if (disposed || !canJudge.value) { gesture.cancel(); return false; }
    return gesture.move(x, y);
  }
  function finishSwipe(): void {
    const result = gesture.finish();
    if (!disposed && canJudge.value && result) animateDecision(result);
  }
  function animateDecision(kind: 'interested' | 'skipped'): void {
    if (disposed || !canJudge.value) return;
    gesture.cancel();
    departing.value = kind;
    // CSSの退出を表示してからSessionを一度だけ進める。連続入力で二重登録しない。
    departureTimer = setTimeout(() => {
      departureTimer = undefined;
      departing.value = null;
      decide(kind);
    }, 200);
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
    if (disposed || departing.value || !article || !session.value) return;
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
    if (departureTimer) clearTimeout(departureTimer);
    departing.value = null;
    disposed = true; loadController?.abort(); finishController?.abort(); cancelFinishTimer();
    for (const controller of readControllers.values()) controller.abort();
    gesture.cancel();
  }
  return { finishing: readonly(finishing), finished: readonly(finished), finishError: readonly(finishError), finishBlocked: readonly(finishBlocked), missingIds: readonly(missingIds), finishSorting, acknowledgeMissing, setOnline,
    storageError: readonly(storageError), pendingWrites: readonly(pendingWrites), retryPending, prepareExit,
    loading: readonly(loading), error: readonly(error), openingError: readonly(openingError),
    currentArticle: readonly(currentArticle), currentReadStatus: readonly(currentReadStatus),
    total, processedCount, interestedIds: readonly(interestedIds), complete, canUndo, canJudge, canNext, canExit, swipeOffset, departing: readonly(departing), animateDecision,
    initialize, retryLoading: loadCandidates, decide, undo, beginSwipe, moveSwipe, finishSwipe, cancelSwipe,
    openCurrentArticle, retryReadSave, dispose };
}
