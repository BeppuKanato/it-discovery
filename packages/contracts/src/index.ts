export type { ArticleListKind, ArticlePageRequest, ArticleListItem, ArticlePageResponse } from './articles';
export type {
  ArticleStateChange, ArticleStateMutationRequest, ArticleStateValue,
  ArticleStateResponse, ArticleStateOperationResponse,
} from './article-state';

// 疎通確認APIのJSON応答を表す。
export interface HealthResponse {
  status: 'ok';
  message: string;
}
