import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { copyBatch, isPendingInterestBatch, sameBatch, type PendingInterestBatch, type PendingInterestStore } from '../../features/sorting/models/pending-interest';
interface PendingDatabase extends DBSchema { batches: { key: string; value: PendingInterestBatch } }

export class IndexedDBPendingInterestStore implements PendingInterestStore {
  private database: Promise<IDBPDatabase<PendingDatabase>> | null = null;
  constructor(private readonly name: string) {}
  private open(): Promise<IDBPDatabase<PendingDatabase>> {
    if (!this.database) this.database = openDB<PendingDatabase>(this.name, 1, {
      upgrade(db) { db.createObjectStore('batches', { keyPath: 'batchId' }); },
      blocked() { /* バージョン移行は接続元を閉じて再試行する。データを消して回避しない。 */ },
    }).catch(error => { this.database = null; throw error; });
    return this.database;
  }
  async loadAll(): Promise<PendingInterestBatch[]> {
    const rows = await (await this.open()).getAll('batches');
    if (!rows.every(isPendingInterestBatch)) throw new Error('保存済みの仕分け結果を確認できません。');
    return rows.map(copyBatch);
  }
  async put(batch: PendingInterestBatch): Promise<void> {
    if (!isPendingInterestBatch(batch)) throw new Error('保存する仕分け結果が不正です。');
    const tx = (await this.open()).transaction('batches', 'readwrite');
    void tx.done.catch(() => {}); // 要求失敗時も完了Promiseの拒否を未処理にしない。下でawaitして呼び出し元へ返す。
    const existing = await tx.store.get(batch.batchId);
    if (existing && (!isPendingInterestBatch(existing) || (existing.revision === batch.revision && !sameBatch(existing,batch)))) {
      await tx.done; throw new Error('保存済みの版と内容が矛盾しています。');
    }
    // 比較と書き込みを同じトランザクション内で行う。遅い旧版で最新結果を戻さない。
    if (!existing || existing.revision < batch.revision) await tx.store.put(copyBatch(batch));
    await tx.done;
  }
  async removeIfMatches(batch: PendingInterestBatch): Promise<boolean> {
    const tx = (await this.open()).transaction('batches', 'readwrite');
    void tx.done.catch(() => {}); // 要求失敗時も完了Promiseの拒否を未処理にしない。下でawaitして呼び出し元へ返す。
    const current = await tx.store.get(batch.batchId);
    if (current && !isPendingInterestBatch(current)) { await tx.done; throw new Error('保存済みの仕分け結果が不正です。'); }
    const matches = !!current && sameBatch(current,batch);
    if (matches) await tx.store.delete(batch.batchId);
    await tx.done; return matches || !current;
  }
  async close(): Promise<void> { const db = this.database; this.database = null; (await db)?.close(); }
}
