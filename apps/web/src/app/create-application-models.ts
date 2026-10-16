import type { Pinia } from 'pinia';
import { ApiClient } from '../infrastructure/api/api-client';
import { IndexedDbUnfinishedArticleChangeStorage } from '../infrastructure/storage/indexeddb-article-change.storage';
import { acquireArticleChangeOwnership } from '../infrastructure/article-change-ownership';
import { useArticleDataStore } from '../features/articles/models/article-data.store';
import { useArticleChangeStore } from '../features/article-changes/models/article-change.store';
import { ArticleChangeSyncModel } from '../features/article-changes/models/article-change-sync.model';
import { createArticleListModel } from '../features/list/models/article-list.model';
import { createApplicationStartupModel } from '../features/startup/models/application-startup.model';

// アプリの組み立て場所。具体的なAPI・端末保存をModelへ渡すのはここ一か所。
// interfaceは実体を生成しない。下で作るApiClient等が、その約束を満たす実体となる。
export function createApplicationModels(pinia: Pinia, baseURL: string) {
  const api = new ApiClient(baseURL);
  const articleData = useArticleDataStore(pinia);
  const changeStore = useArticleChangeStore(pinia);
  // 保存名と形式は既存版と同じ。名前変更で端末に残った操作を見失わないようにする。
  const scope = 'it-discovery:article-state:' + new URL(baseURL, window.location.href).href;
  const unfinishedChangeStorage = new IndexedDbUnfinishedArticleChangeStorage(scope);
  const articleChanges = new ArticleChangeSyncModel(api, unfinishedChangeStorage,
    () => acquireArticleChangeOwnership(scope), changeStore, articleData);
  const startup = createApplicationStartupModel(articleChanges, changeStore);
  // 同期はアプリ全体で共有する。一覧Modelだけは画面ごとに作り、取得条件を共有しない。
  function createArticleList() { return createArticleListModel(api, articleData, changeStore); }
  const online = () => articleChanges.setOnline(navigator.onLine);
  online();
  window.addEventListener('online', online); window.addEventListener('offline', online);
  function dispose(): void {
    startup.dispose();
    window.removeEventListener('online', online); window.removeEventListener('offline', online);
    articleChanges.dispose();
  }
  // Viewへ渡すのはModelの窓口。APIやStoreをPageで組み立て直さない。
  return { articleChanges, startup, createArticleList, dispose };
}
export type ApplicationModels = ReturnType<typeof createApplicationModels>;
