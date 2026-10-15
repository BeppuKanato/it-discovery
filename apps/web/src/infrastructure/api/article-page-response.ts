import type { ArticlePageResponse } from '@it-discovery/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

// 一覧APIのJSONと続き情報が表示可能な形式か確認する。
export function isArticlePageResponse(value: unknown, cursor?: string): value is ArticlePageResponse {
  if (!isRecord(value) || !Array.isArray(value['articles']) || value['articles'].length > 20
    || typeof value['hasMore'] !== 'boolean') return false;
  if (value['hasMore']) {
    if (typeof value['nextCursor'] !== 'string' || value['nextCursor'].length === 0
      || value['nextCursor'] === cursor || value['articles'].length === 0) return false;
  } else if (value['nextCursor'] !== null) return false;
  return value['articles'].every((item: unknown) => {
    if (!isRecord(item) || !isRecord(item['source']) || !isRecord(item['state'])) return false;
    const source = item['source'];
    const state = item['state'];
    return Number.isSafeInteger(item['articleId']) && (item['articleId'] as number) > 0
      && typeof item['title'] === 'string' && typeof item['url'] === 'string'
      && (item['description'] === null || typeof item['description'] === 'string')
      && (item['author'] === null || typeof item['author'] === 'string')
      && isDate(item['fetchedAt'])
      && (item['publishedAt'] === null || isDate(item['publishedAt']))
      && (item['sourceUpdatedAt'] === null || isDate(item['sourceUpdatedAt']))
      && typeof source['sourceId'] === 'string' && typeof source['siteName'] === 'string'
      && (source['iconUrl'] === null || typeof source['iconUrl'] === 'string')
      && typeof state['interested'] === 'boolean' && typeof state['pinned'] === 'boolean'
      && (state['lastOpenedAt'] === null || isDate(state['lastOpenedAt']));
  });
}
