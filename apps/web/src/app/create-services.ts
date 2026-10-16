import { useArticleDataStore } from '../features/articles/models/article-data.store';
import type { Pinia } from 'pinia';
import { ApiClient } from '../infrastructure/api/api-client';
import { IndexedDbUnfinishedArticleChangeStorage } from '../infrastructure/storage/indexeddb-article-change.storage';
import { acquireStateSyncOwner } from '../infrastructure/state-sync-owner';
import { useArticleChangeStore } from '../features/article-changes/models/article-change.store';
import { ArticleChangeSyncModel } from '../features/article-changes/models/article-change-sync.model';

// Appの組み立て専用。ViewModelはこの具体クラスやブラウザ接続先の作り方を知らなくてよい。
export function createApplicationServices(pinia: Pinia, baseURL: string) {
  const api = new ApiClient(baseURL);
  const articleData = useArticleDataStore(pinia);
  const articleState = useArticleChangeStore(pinia);
  const scope = `it-discovery:article-state:${new URL(baseURL, window.location.href).href}`;
  const operationStore = new IndexedDbUnfinishedArticleChangeStorage(scope);
  const sync = new ArticleChangeSyncModel(api, operationStore, () => acquireStateSyncOwner(scope), articleState, articleData);
  // 接続状況と送信所有権は画面をまたぐので、一覧ページでなくアプリ全体の寿命に合わせる。
  const online = () => sync.setOnline(navigator.onLine);
  online();
  window.addEventListener('online', online);
  window.addEventListener('offline', online);
  function dispose(): void {
    window.removeEventListener('online', online); window.removeEventListener('offline', online);
    sync.dispose();
  }
  return { api, articleState, articleData, sync, dispose };
}

export type ApplicationServices = ReturnType<typeof createApplicationServices>;
