import { copyBatch, type PendingInterestBatch, type PendingInterestStore } from './pending-interest';

// 一回の仕分け専用。書き込みを直列化し、失敗後は明示的なretryまで後続も止める。
export class PendingInterestModel {
  private revision = 0;
  private latest: PendingInterestBatch | null = null;
  private tail: Promise<void> = Promise.resolve();
  private failed = false;
  constructor(private readonly store: PendingInterestStore, private readonly batchId = crypto.randomUUID()) {}
  update(articleIds: readonly number[]): Promise<void> {
    this.latest = copyBatch({ batchId: this.batchId, revision: ++this.revision, articleIds: [...articleIds] });
    return this.enqueue(this.latest, false);
  }
  private enqueue(batch: PendingInterestBatch, retry: boolean): Promise<void> {
    const job = this.tail.then(async () => {
      if (this.failed && !retry) throw new Error('端末保存が停止しています。');
      try { await this.store.put(copyBatch(batch)); if (retry) this.failed = false; }
      catch (error) { this.failed = true; throw error; }
    });
    this.tail = job.catch(() => {}); // 呼び出し元へはjobの失敗を返し、内部の連鎖は再試行可能にする。
    return job;
  }
  async retry(): Promise<void> { if (this.latest) await this.enqueue(this.latest, true); }
  async flush(): Promise<PendingInterestBatch | null> {
    await this.tail;
    if (this.failed) throw new Error('最新の結果を端末へ保存できていません。');
    return this.latest ? copyBatch(this.latest) : null;
  }
}
