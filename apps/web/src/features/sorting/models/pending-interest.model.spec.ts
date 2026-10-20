import { describe, expect, it, vi } from 'vitest';
import { PendingInterestModel } from './pending-interest.model';
import { memoryPendingStore } from '../../../test/pending-interest-fixture';
describe('仕分けの順序付き端末保存', () => {
  it('画面を待たせず呼び出せ、前の保存が終わるまで次の保存を開始しない', async () => {
    const store = memoryPendingStore(); let release!:()=>void;
    const put = vi.spyOn(store,'put').mockImplementationOnce(()=>new Promise<void>(yes=>{release=yes;}));
    const model = new PendingInterestModel(store); const a = model.update([1]); const b = model.update([1,2]); const c = model.update([2]);
    await Promise.resolve(); expect(put).toHaveBeenCalledTimes(1); release(); await Promise.all([a,b,c]);
    expect((await model.flush())?.articleIds).toEqual([2]); expect(put.mock.calls.map(([batch])=>batch.revision)).toEqual([1,2,3]);
  });
  it('失敗後は後続を書かず、最新集合を明示的な再試行で保存する', async () => {
    const store = memoryPendingStore(); const put = vi.spyOn(store,'put').mockRejectedValueOnce(new Error('quota'));
    const model = new PendingInterestModel(store); const results = await Promise.allSettled([model.update([1]),model.update([1,2]),model.update([])]);
    expect(results.every(r=>r.status==='rejected')).toBe(true); expect(put).toHaveBeenCalledTimes(1); await expect(model.flush()).rejects.toThrow();
    await model.retry(); expect((await model.flush())?.articleIds).toEqual([]); expect((await store.loadAll())[0]?.revision).toBe(3);
  });
});
