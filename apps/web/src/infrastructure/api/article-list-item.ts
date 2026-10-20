import type { ArticleListItem } from '@it-discovery/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

// 一覧と仕分けのカードに共通するJSON検証。型宣言だけでは実行時の値は保証されない。
export function isArticleListItem(item: unknown): item is ArticleListItem {
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
}
