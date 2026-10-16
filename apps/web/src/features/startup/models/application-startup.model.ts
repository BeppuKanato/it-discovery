import { watch, type WatchStopHandle } from 'vue';
import type { ArticleChangeActions } from '../../article-changes/models/article-change-contracts';
import type { ArticleChangeStore } from '../../article-changes/models/article-change.store';
import type { ArticleListModel } from '../../list/models/article-list.model';

// 起動Model：端末の未完了変更の解消→初回一覧取得、の順番だけを調整する。
// 一覧VMに同期の復元手順を持ち込まない。再送そのものは記事変更同期Modelが行う。
export function createApplicationStartupModel(articleChanges: Pick<ArticleChangeActions, 'restoreAndSyncUnfinishedChanges'>,
  changeStore: ArticleChangeStore) {
  let started = false;
  let disposed = false;
  let stopWaiting: WatchStopHandle | null = null;
  async function startArticleList(list: ArticleListModel): Promise<void> {
    if (started || disposed) return;
    started = true;
    await articleChanges.restoreAndSyncUnfinishedChanges();
    if (disposed) return;
    if (changeStore.syncStatus.startupSyncComplete) await list.refreshArticles();
    else {
      // 通信復旧や手動再試行で同期が解消したら、一度だけ初回一覧を取得する。
      stopWaiting = watch(() => changeStore.syncStatus.startupSyncComplete, (complete) => {
        if (complete) { stopWaiting?.(); stopWaiting = null; void list.refreshArticles(); }
      });
    }
  }
  function dispose(): void { disposed = true; stopWaiting?.(); }
  return { startArticleList, dispose };
}
