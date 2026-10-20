import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { IndexedDBPendingInterestStore } from './indexeddb-pending-interest.store';
const batchId = '00000000-0000-4000-8000-000000000001';
describe('仕分け結果のIndexedDB保存', () => {
  it('取り消し後の最新集合を再接続して復元し、遅い旧版・配列の変更から守る', async () => {
    const name = crypto.randomUUID(); const store = new IndexedDBPendingInterestStore(name);
    const original = {batchId,revision:1,articleIds:[1,2]}; await store.put(original); original.articleIds.push(3);
    await store.put({batchId,revision:3,articleIds:[2]}); await store.put({batchId,revision:2,articleIds:[1,2,3]});
    await store.close(); const reopened = new IndexedDBPendingInterestStore(name);
    expect(await reopened.loadAll()).toEqual([{batchId,revision:3,articleIds:[2]}]);
    expect(await reopened.removeIfMatches({batchId,revision:1,articleIds:[1,2]})).toBe(false);
    expect(await reopened.removeIfMatches({batchId,revision:3,articleIds:[2]})).toBe(true); expect(await reopened.loadAll()).toEqual([]); await reopened.close();
  });
  it('同じ版の異なる内容を拒否し、壊れた端末記録も消さずに検出する', async () => {
    const name = crypto.randomUUID(); const store = new IndexedDBPendingInterestStore(name);
    await store.put({batchId,revision:1,articleIds:[1]}); await expect(store.put({batchId,revision:1,articleIds:[2]})).rejects.toThrow('矛盾');
    const raw = await openDB(name,1); await raw.put('batches',{batchId,revision:'bad',articleIds:[1]}); raw.close();
    await expect(store.loadAll()).rejects.toThrow('確認できません'); await store.close();
  });
});
