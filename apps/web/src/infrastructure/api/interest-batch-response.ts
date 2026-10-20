import type { InterestBatchResponse } from '@it-discovery/contracts';
import type { PendingInterestBatch } from '../../features/sorting/models/pending-interest';
export function isInterestBatchResponse(value: unknown, batch: PendingInterestBatch): value is InterestBatchResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string,unknown>;
  if (row['batchId'] !== batch.batchId || row['revision'] !== batch.revision || !Array.isArray(row['results']) || row['results'].length !== batch.articleIds.length) return false;
  const remaining = new Set(batch.articleIds);
  for (const item of row['results']) {
    if (!item || typeof item !== 'object' || !remaining.delete(item.articleId) || !['saved','missing'].includes(item.status)) return false;
  }
  return remaining.size === 0;
}
