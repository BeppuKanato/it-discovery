import { vi } from 'vitest';
import type { PendingInterestBatch } from '../features/sorting/models/pending-interest';
export function interestBatchApiFixture() {
  return {
    getInterestBatchResult: vi.fn().mockResolvedValue(undefined),
    saveInterestBatch: vi.fn().mockImplementation(async (batch: PendingInterestBatch) => ({ batchId:batch.batchId,revision:batch.revision,results:batch.articleIds.map(articleId=>({articleId,status:'saved' as const})) })),
  };
}
