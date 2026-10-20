import type { ArticleStateResponse } from '@it-discovery/contracts';

// JSONの型宣言だけを信用せず、対象記事と各状態を確認する。
export function isArticleStateResponse(value: unknown, articleId: number): value is ArticleStateResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row['articleId'] !== articleId || !row['state'] || typeof row['state'] !== 'object') return false;
  const state = row['state'] as Record<string, unknown>;
  return typeof state['interested'] === 'boolean' && typeof state['pinned'] === 'boolean'
    && (state['lastOpenedAt'] === null || (typeof state['lastOpenedAt'] === 'string'
      && Number.isFinite(Date.parse(state['lastOpenedAt']))));
}
