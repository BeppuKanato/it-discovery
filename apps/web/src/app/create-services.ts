import type { Pinia } from 'pinia';
import { ApiClient } from '../infrastructure/api/api-client';
import { IndexedDbStateOperationStore } from '../infrastructure/storage/indexeddb-state-operation.store';
import { acquireStateSyncOwner } from '../infrastructure/state-sync-owner';
import { useArticleStateStore } from '../features/article-state/models/article-state.store';
import { ArticleStateSyncService } from '../features/article-state/models/article-state-sync.service';

// Appの組み立て専用。ViewModelはこの具体クラスやブラウザ接続先の作り方を知らなくてよい。
export function createApplicationServices(pinia: Pinia, baseURL: string) {
  const api = new ApiClient(baseURL);
  const articleState = useArticleStateStore(pinia);
  const scope = `it-discovery:article-state:${new URL(baseURL, window.location.href).href}`;
  const operationStore = new IndexedDbStateOperationStore(scope);
  const sync = new ArticleStateSyncService(api, operationStore, () => acquireStateSyncOwner(scope), articleState);
  // 接続状況と送信所有権は画面をまたぐので、一覧ページでなくアプリ全体の寿命に合わせる。
  const online = () => sync.setOnline(navigator.onLine);
  online();
  window.addEventListener('online', online);
  window.addEventListener('offline', online);
  function dispose(): void {
    window.removeEventListener('online', online); window.removeEventListener('offline', online);
    sync.dispose();
  }
  return { api, articleState, sync, dispose };
}

export type ApplicationServices = ReturnType<typeof createApplicationServices>;
