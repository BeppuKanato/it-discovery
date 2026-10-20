// 復元するのは最終登録IDだけ。カード・見送り・位置・判断履歴は端末へ保存しない。
export interface PendingInterestBatch { batchId: string; revision: number; articleIds: number[] }
export interface PendingInterestStore {
  loadAll(): Promise<PendingInterestBatch[]>;
  put(batch: PendingInterestBatch): Promise<void>;
  removeIfMatches(batch: PendingInterestBatch): Promise<boolean>;
}
export function isPendingInterestBatch(value: unknown): value is PendingInterestBatch {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row['batchId'] === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row['batchId'])
    && Number.isSafeInteger(row['revision']) && (row['revision'] as number) > 0
    && Array.isArray(row['articleIds']) && row['articleIds'].length <= 10
    && row['articleIds'].every((id: unknown) => Number.isSafeInteger(id) && (id as number) > 0)
    && new Set(row['articleIds']).size === row['articleIds'].length;
}
export function copyBatch(batch: PendingInterestBatch): PendingInterestBatch {
  return { batchId: batch.batchId, revision: batch.revision, articleIds: [...batch.articleIds].sort((a,b) => a-b) };
}
export function sameBatch(a: PendingInterestBatch, b: PendingInterestBatch): boolean {
  return a.batchId === b.batchId && a.revision === b.revision && JSON.stringify(copyBatch(a).articleIds) === JSON.stringify(copyBatch(b).articleIds);
}
