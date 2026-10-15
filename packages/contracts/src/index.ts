export type { ArticleListKind, ArticlePageRequest, ArticleListItem, ArticlePageResponse } from './articles';

// 疎通確認APIのJSON応答を表す。
export interface HealthResponse {
  status: 'ok';
  message: string;
}
