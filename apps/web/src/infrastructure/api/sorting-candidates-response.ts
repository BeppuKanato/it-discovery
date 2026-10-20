import type { SortingCandidatesResponse } from '@it-discovery/contracts';
import { isArticleListItem } from './article-list-item';

export function isSortingCandidatesResponse(value: unknown): value is SortingCandidatesResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('articles' in value)
    || !Array.isArray(value.articles) || value.articles.length > 10) return false;
  const ids = new Set<number>();
  return value.articles.every(item => {
    if (!isArticleListItem(item) || item.state.interested || item.state.pinned || item.state.lastOpenedAt !== null || ids.has(item.articleId)) return false;
    ids.add(item.articleId);
    return true;
  });
}
