import type { InterestBatchResponse, SortingCandidatesResponse } from '@it-discovery/contracts';
import type { ArticleListEntry } from '../../models/article-page';
import type { InterestBatchResult } from '../../models/article-sorting';
import { toArticleListItem } from './article.formatter';

export function toSortingCandidatesResponse(entries: ArticleListEntry[]): SortingCandidatesResponse {
  return { articles: entries.map(toArticleListItem) };
}

// 端末が確認に使う識別子と結果だけを返す。保存用requestKeyなどは公開しない。
export function toInterestBatchResponse(result: InterestBatchResult): InterestBatchResponse {
  return { batchId: result.batchId, revision: result.revision,
    results: result.results.map(({ articleId, status }) => ({ articleId, status })) };
}
