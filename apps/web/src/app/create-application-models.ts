import { BrowserApplicationLease } from '../infrastructure/browser/application-lease';
import { ApplicationStartupModel } from '../features/startup/models/application-startup.model';
import { InterestBatchSyncModel } from '../features/sorting/models/interest-batch-sync.model';
import { IndexedDBPendingInterestStore } from '../infrastructure/storage/indexeddb-pending-interest.store';
import { PendingInterestModel } from '../features/sorting/models/pending-interest.model';
import { SortingModel } from '../features/sorting/models/sorting.model';
import { ArticleOpeningModel } from '../features/articles/models/article-opening.model';
import { BrowserArticleOpener } from '../infrastructure/browser/external-article-opener';
import { ApiClient } from '../infrastructure/api/api-client';
import { ArticleListModel } from '../features/list/models/article-list.model';
import { ArticleStateModel } from '../features/articles/models/article-state.model';

// 通信の実体とModelを組み立てるだけ。取得開始や画面状態の管理は行わない。
export function createApplicationModels(baseURL: string) {
  const api = new ApiClient(baseURL);
  const apiScope = new URL(baseURL,window.location.href).href.replace(/\/$/,'');
  const pendingStore = new IndexedDBPendingInterestStore(`it-discovery-sorting:${apiScope}`);
  const sorting = new SortingModel(api);
  const interestBatchSync = new InterestBatchSyncModel(pendingStore,api);
  const startup = new ApplicationStartupModel(new BrowserApplicationLease(`it-discovery-owner:${apiScope}`),pendingStore,interestBatchSync,sorting);
  return { startup, interestBatchSync, createPendingInterests: () => new PendingInterestModel(pendingStore), sorting,
    articleList: new ArticleListModel(api), articleState: new ArticleStateModel(api), articleOpening: new ArticleOpeningModel(new BrowserArticleOpener()) };
}
export type ApplicationModels = ReturnType<typeof createApplicationModels>;
