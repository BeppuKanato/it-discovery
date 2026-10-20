import { isArticleListItem } from './article-list-item';
import type { ArticlePageResponse } from '@it-discovery/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// 一覧APIのJSONと続き情報が表示可能な形式か確認する。
export function isArticlePageResponse(value: unknown, cursor?: string): value is ArticlePageResponse {
  if (!isRecord(value) || !Array.isArray(value['articles']) || value['articles'].length > 20
    || typeof value['hasMore'] !== 'boolean') return false;
  if (value['hasMore']) {
    if (typeof value['nextCursor'] !== 'string' || value['nextCursor'].length === 0
      || value['nextCursor'] === cursor || value['articles'].length === 0) return false;
  } else if (value['nextCursor'] !== null) return false;
  return value['articles'].every(isArticleListItem);
}
