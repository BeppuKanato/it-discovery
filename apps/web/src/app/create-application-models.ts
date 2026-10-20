import { ApiClient } from '../infrastructure/api/api-client';
import { ArticleListModel } from '../features/list/models/article-list.model';
import { ArticleStateModel } from '../features/articles/models/article-state.model';

// 通信の実体とModelを組み立てるだけ。取得開始や画面状態の管理は行わない。
export function createApplicationModels(baseURL: string) {
  const api = new ApiClient(baseURL);
  return { articleList: new ArticleListModel(api), articleState: new ArticleStateModel(api) };
}
export type ApplicationModels = ReturnType<typeof createApplicationModels>;
