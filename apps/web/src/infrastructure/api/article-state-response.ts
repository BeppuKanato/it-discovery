import type { ArticleStateOperationResponse } from '@it-discovery/contracts';

// 受信したJSONは型宣言だけでは保証できない。操作ID・記事ID・状態を実行時に確認する。
export function isArticleStateOperationResponse(value: unknown, operationId: string, articleId?: number): value is ArticleStateOperationResponse {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (row['operationId'] !== operationId || !Number.isSafeInteger(row['articleId'])
    || (row['articleId'] as number) <= 0 || (articleId !== undefined && row['articleId'] !== articleId)) return false;
  if (row['status'] === 'missing') return row['state'] === null;
  if (row['status'] !== 'saved' || !row['state'] || typeof row['state'] !== 'object') return false;
  const state = row['state'] as Record<string, unknown>;
  return typeof state['interested'] === 'boolean' && typeof state['pinned'] === 'boolean'
    && (state['lastOpenedAt'] === null || (typeof state['lastOpenedAt'] === 'string'
      && Number.isFinite(Date.parse(state['lastOpenedAt']))));
}
