export type { ArticleSource, ArticleListKind, ArticlePageRequest, ArticleListItem, ArticlePageResponse } from './articles';
export type {
  ArticleStateChange, ArticleStateUpdateRequest, ArticleStateValue,
  ArticleStateResponse,
} from './article-state';

// 疎通確認APIのJSON応答を表す。
export interface HealthResponse {
  status: 'ok';
  message: string;
}

export type { SortingCandidatesResponse, InterestBatchRequest, InterestBatchResponse } from './sorting';

export type { CompanionMessage, CompanionChatRequest, CompanionChatResponse, DiscoveryNote, DiscoveryNoteRequest } from './companion';
export type { DiscoveryNoteCalendar, DiscoveryNoteDay } from './companion';
