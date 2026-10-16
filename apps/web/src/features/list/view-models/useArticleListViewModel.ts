import { computed, reactive } from 'vue';
import type { ArticleListKind } from '@it-discovery/contracts';
import type { ArticleChangeViewActions } from '../../article-changes/models/article-change-contracts';
import type { ArticleListModel } from '../models/article-list.model';
import { PullToRefreshGesture, type PullGestureInput } from '../models/pull-to-refresh-gesture';

// ViewModel：画面の入力をModelの操作へ接続し、表示する値を公開する。
// API・Store・未完了キュー・起動同期の中身を参照しない。
export function useArticleListViewModel(list: ArticleListModel, articleChanges: ArticleChangeViewActions) {
  let disposed = false;
  // 一覧の値はModelの読み取り専用refをそのまま公開し、別コピーを作らない。
  const { selectedKind, displayedArticles, nextCursor, hasMore, listLoading, listError, canLoadMore } = list;
  // computedは同期Modelが返す値を追跡する。Viewには操作関数やStoreを渡さない。
  const syncDisplay = computed(() => articleChanges.getSyncDisplay());
  const pullGesture = reactive(new PullToRefreshGesture());
  const pullDistance = computed(() => pullGesture.distance);
  const pullReady = computed(() => pullGesture.ready);
  function canPullToRefresh(): boolean {
    return !disposed && syncDisplay.value.startupSyncComplete && listLoading.value !== 'initial' && listLoading.value !== 'refresh';
  }
  function beginPull(input: PullGestureInput): void { pullGesture.begin(input, canPullToRefresh()); }
  function movePull(input: PullGestureInput): boolean { return pullGesture.move(input, canPullToRefresh()); }
  async function finishPull(): Promise<void> { if (pullGesture.finish(canPullToRefresh())) await list.refreshArticles(); }
  function cancelPull(): void { pullGesture.cancel(); }

  function refreshArticles(): Promise<void> { return disposed ? Promise.resolve() : list.refreshArticles(); }
  function changeListKind(value: ArticleListKind): Promise<void> {
    if (disposed) return Promise.resolve();
    cancelPull();
    return list.changeListKind(value);
  }
  function loadMoreArticles(): Promise<void> { return disposed ? Promise.resolve() : list.loadMoreArticles(); }
  function retryArticleLoad(): Promise<void> { return disposed ? Promise.resolve() : list.retryArticleLoad(); }
  // 反転する値の決定と変更の保存はModelの仕事。VMは記事IDと操作の種類を渡す。
  function togglePin(articleId: number): void { if (!disposed) articleChanges.toggleArticleField(articleId, 'pinned'); }
  function toggleInterest(articleId: number): void { if (!disposed) articleChanges.toggleArticleField(articleId, 'interested'); }
  function retrySync(): void { if (!disposed) articleChanges.retryUnfinishedChanges(); }
  function discardBlocked(): void { if (!disposed) articleChanges.discardBlockedChanges(); }
  function dispose(): void { disposed = true; cancelPull(); list.dispose(); }

  return { selectedKind, displayedArticles, nextCursor, hasMore, listLoading, listError, canLoadMore, syncDisplay,
    pullDistance, pullReady, beginPull, movePull, finishPull, cancelPull,
    refreshArticles, changeListKind, loadMoreArticles, retryArticleLoad, togglePin, toggleInterest, retrySync, discardBlocked, dispose };
}
export type ArticleListViewModel = ReturnType<typeof useArticleListViewModel>;
