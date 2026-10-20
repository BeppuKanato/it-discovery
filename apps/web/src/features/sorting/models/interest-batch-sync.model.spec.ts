import { describe, expect, it, vi } from 'vitest';
import { memoryPendingStore } from '../../../test/pending-interest-fixture';
import { interestBatchApiFixture } from '../../../test/interest-batch-fixture';
import { InterestBatchSyncModel } from './interest-batch-sync.model';
const batch={batchId:'00000000-0000-4000-8000-000000000001',revision:3,articleIds:[1,2]};
describe('仕分け結果の送信と完了解消',()=>{
  it('まず結果を照会し、応答喪失後の再試行でPUTを重ねず、確認するまで端末記録を残す',async()=>{
    const store=memoryPendingStore();await store.put(batch);const api=interestBatchApiFixture();const model=new InterestBatchSyncModel(store,api);
    const result=await model.send(batch);expect(await store.loadAll()).toEqual([batch]);expect(api.saveInterestBatch).toHaveBeenCalledOnce();
    api.getInterestBatchResult.mockResolvedValueOnce(result);await model.send(batch);expect(api.saveInterestBatch).toHaveBeenCalledOnce();
    await model.acknowledge(batch);expect(await store.loadAll()).toEqual([]);
  });
  it('空集合はGETもPUTも行わず、古い版の成功で新しい版を消さない',async()=>{
    const store=memoryPendingStore();const api=interestBatchApiFixture();const model=new InterestBatchSyncModel(store,api);
    const empty={...batch,articleIds:[]};await store.put(empty);expect((await model.send(empty)).results).toEqual([]);expect(api.getInterestBatchResult).not.toHaveBeenCalled();expect(api.saveInterestBatch).not.toHaveBeenCalled();
    await store.put({...empty,revision:4,articleIds:[3]});await expect(model.acknowledge(empty)).rejects.toMatchObject({kind:'blocked'});expect((await store.loadAll())[0]?.revision).toBe(4);
  });
  it('端末削除失敗後も結果照会で保存済みを読み、削除だけ再試行できる',async()=>{
    const store=memoryPendingStore();await store.put(batch);const api=interestBatchApiFixture();const model=new InterestBatchSyncModel(store,api);const result=await model.send(batch);
    const remove=vi.spyOn(store,'removeIfMatches').mockRejectedValueOnce(new Error('disk'));
    await expect(model.acknowledge(batch)).rejects.toThrow();api.getInterestBatchResult.mockResolvedValueOnce(result);await model.send(batch);await model.acknowledge(batch);
    expect(api.saveInterestBatch).toHaveBeenCalledOnce();expect(remove).toHaveBeenCalledTimes(2);
  });
});
