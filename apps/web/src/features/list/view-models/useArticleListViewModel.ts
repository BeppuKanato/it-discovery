import type { ArticleDataStore } from '../../articles/models/article-data.store';
import { computed, reactive, readonly, ref, shallowRef, watch, type WatchStopHandle } from 'vue';
import type { ArticleListItem, ArticleListKind } from '@it-discovery/contracts';
import type { ArticleListApi } from '../models/article-list-api';
import type { ArticleChangeStore } from '../../article-changes/models/article-change.store';
import type { ArticleChangeActions, StateField } from '../../article-changes/models/article-change-contracts';

import { PullToRefreshGesture, type PullGestureInput } from '../models/pull-to-refresh-gesture';

type LoadMode = 'initial' | 'refresh' | 'append';
interface ListLoadError { mode: LoadMode; message: string }

// ViewModel：一覧画面の状態・表示用の計算・操作をまとめる。
// DOM、PrimeVue、Axios、IndexedDBは参照しない。Viewはこの戻り値だけで画面を組み立てる。
export function useArticleListViewModel(api: ArticleListApi, articleState: ArticleChangeStore, articleData: ArticleDataStore, sync: ArticleChangeActions) {
  const kind = ref<ArticleListKind>('all');
  // 一覧が保持するのは記事IDと続き位置。記事内容と確定状態の管理元は共有Storeに一本化する。
  const articleIds = shallowRef<number[]>([]);
  const nextCursor = ref<string | null>(null);
  const hasMore = ref(false);
  const loading = ref<LoadMode | null>(null);
  const error = ref<ListLoadError | null>(null);
  let generation = 0;
  let activeRequest: AbortController | null = null;
  let disposed = false;
  let initializing = false;
  let stopReady: WatchStopHandle | null = null;

  // Modelの状態をVueの変更追跡へ接続するのはVMの役割。Model自体はVueを知らない。
  // reactiveはこのインスタンスを経由した変更を追跡し、computedでViewへ必要な値だけ公開する。
  const pullGesture = reactive(new PullToRefreshGesture());
  const pullDistance = computed(() => pullGesture.distance);
  const pullReady = computed(() => pullGesture.ready);
  // disposedはVueの状態ではないため、キャッシュせず操作のたびに現在値を確認する。
  function canPullToRefresh(): boolean {
    return !disposed && articleState.syncStatus.startupSyncComplete && loading.value !== 'initial' && loading.value !== 'refresh';
  }

  // Viewから渡された値をModelへ送り、成立した操作を一覧更新へつなぐ。
  // Modelの移動量やしきい値をViewに判断させず、TouchEventもModelへ渡さない。
  function beginPull(input: PullGestureInput): void { pullGesture.begin(input, canPullToRefresh()); }
  function movePull(input: PullGestureInput): boolean { return pullGesture.move(input, canPullToRefresh()); }
  async function finishPull(): Promise<void> {
    if (pullGesture.finish(canPullToRefresh())) await refresh();
  }
  function cancelPull(): void { pullGesture.cancel(); }

  // computedはStoreも追跡する。独自の通知番号を増やして描画を促す必要はない。
  // 表示用の配列を状態として二重保存せず、IDと最新状態から毎回必要な値を求める。
  const articles = computed(() => {
    const ids = new Set(articleIds.value);
    if (kind.value === 'interested') {
      for (const id of articleData.getLocallyChangedInterestIds()) ids.add(id);
    }
    return [...ids].map((id) => articleState.applyUnfinishedChanges(articleData.getConfirmedArticle(id)))
      .filter((article): article is ArticleListItem => article !== null && (kind.value === 'all' || article.state.interested))
      .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt) || b.articleId - a.articleId);
  });
  // Viewへは必要な値だけを渡し、Storeそのものや同期クラスを公開しない。
  const syncStatus = computed(() => ({
    ready: articleState.syncStatus.startupSyncComplete, canChange: articleState.canChangeArticles,
    pendingCount: articleState.unfinishedCount, blockedCount: articleState.blockedCount,
    notice: articleState.syncStatus.notice, storageError: articleState.syncStatus.storageError,
    startupError: articleState.syncStatus.startupError, online: articleState.syncStatus.online,
  }));
  const canLoadMore = computed(() => articleState.syncStatus.startupSyncComplete && hasMore.value && nextCursor.value !== null && loading.value === null && error.value === null);

  // 世代番号は一覧要求の新旧、Storeのversionは記事変更の新旧を判定する別の番号。
  async function request(mode: LoadMode): Promise<void> {
    if (disposed || !articleState.syncStatus.startupSyncComplete) return;
    if (mode === 'append' && (loading.value !== null || !hasMore.value || !nextCursor.value)) return;
    const requestGeneration = ++generation;
    const readVersion = articleData.changeVersion;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const cursor = mode === 'append' ? nextCursor.value ?? undefined : undefined;
    loading.value = mode; error.value = null;
    try {
      const page = await api.getArticlePage({ kind: kind.value, limit: 20, ...(cursor ? { cursor } : {}) }, controller.signal);
      if (disposed || generation !== requestGeneration) return;
      // 応答のstateを別コピーとして表示せず、Storeの整合ルールを通して取り込む。
      articleData.importFetchedArticles(page.articles, readVersion, articleState.hasUnfinishedFieldChange);
      const ids = new Set(mode === 'append' ? articleIds.value : []);
      for (const article of page.articles) ids.add(article.articleId);
      articleIds.value = [...ids];
      nextCursor.value = page.nextCursor; hasMore.value = page.hasMore;
    } catch {
      if (disposed || generation !== requestGeneration) return;
      error.value = { mode, message: mode === 'append' ? '続きを取得できませんでした。'
        : mode === 'refresh' ? '一覧を更新できませんでした。' : '一覧を取得できませんでした。' };
    } finally {
      if (!disposed && generation === requestGeneration) { loading.value = null; activeRequest = null; }
    }
  }

  function refresh(): Promise<void> {
    if (loading.value === 'initial' || loading.value === 'refresh') return Promise.resolve();
    return request(articleIds.value.length ? 'refresh' : 'initial');
  }
  function changeKind(value: ArticleListKind): Promise<void> {
    if (!articleState.syncStatus.startupSyncComplete || value === kind.value || disposed) return Promise.resolve();
    cancelPull();
    kind.value = value; articleIds.value = []; nextCursor.value = null; hasMore.value = false;
    return request('initial');
  }
  function loadMore(): Promise<void> { return canLoadMore.value ? request('append') : Promise.resolve(); }
  function retry(): Promise<void> { return error.value ? request(error.value.mode) : Promise.resolve(); }

  // 画面から来る「反転」の意図を、現在の表示値に対する明示値へ変換してModelへ渡す。
  // ServiceへはsetState(id, field, true/false)を依頼するため、再送で反転を繰り返さない。
  function toggleState(articleId: number, field: StateField): void {
    const current = articleState.applyUnfinishedChanges(articleData.getConfirmedArticle(articleId));
    if (!disposed && current && articleState.canChangeArticles) sync.setArticleState(articleId, field, !current.state[field]);
  }
  function togglePin(articleId: number): void { toggleState(articleId, 'pinned'); }
  function toggleInterest(articleId: number): void { toggleState(articleId, 'interested'); }
  function retrySync(): void { if (!disposed) sync.retryUnfinishedChanges(); }
  function discardBlocked(): void { if (!disposed) sync.discardBlockedChanges(); }

  // 起動時の残りを同期してから初回一覧を取得する。復旧待ちは一度だけ監視する。
  async function initialize(): Promise<void> {
    if (initializing || disposed) return;
    initializing = true;
    await sync.restoreAndSyncUnfinishedChanges();
    if (disposed) return;
    if (articleState.syncStatus.startupSyncComplete) await refresh();
    else stopReady = watch(() => articleState.syncStatus.startupSyncComplete, (ready) => {
      if (ready) { stopReady?.(); stopReady = null; void refresh(); }
    });
  }

  // 画面終了では画面の通信・監視だけ止める。共有同期の終了はAppが担当する。
  function dispose(): void { cancelPull(); disposed = true; generation++; activeRequest?.abort(); stopReady?.(); }
  return { kind: readonly(kind), articles, nextCursor: readonly(nextCursor), hasMore: readonly(hasMore),
    loading: readonly(loading), error: readonly(error), canLoadMore, syncStatus, pullDistance, pullReady,
    beginPull, movePull, finishPull, cancelPull,
    initialize, refresh, changeKind, loadMore, retry, togglePin, toggleInterest, retrySync, discardBlocked, dispose };
}
export type ArticleListViewModel = ReturnType<typeof useArticleListViewModel>;

export interface ArticleListServices { api: ArticleListApi; articleState: ArticleChangeStore; articleData: ArticleDataStore; sync: ArticleChangeActions }
