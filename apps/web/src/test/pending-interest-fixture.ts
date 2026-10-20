import { copyBatch, sameBatch, type PendingInterestBatch, type PendingInterestStore } from '../features/sorting/models/pending-interest';
export function memoryPendingStore(): PendingInterestStore {
  const records = new Map<string, PendingInterestBatch>();
  return {
    async loadAll() { return [...records.values()].map(copyBatch); },
    async put(batch) { const old = records.get(batch.batchId); if (!old || old.revision < batch.revision) records.set(batch.batchId,copyBatch(batch)); },
    async removeIfMatches(batch) { const old = records.get(batch.batchId); if (old && !sameBatch(old,batch)) return false; records.delete(batch.batchId); return true; },
  };
}
