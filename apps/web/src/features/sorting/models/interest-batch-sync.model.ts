import type { InterestBatchResponse } from '@it-discovery/contracts';
import { copyBatch, type PendingInterestBatch, type PendingInterestStore } from './pending-interest';
export interface InterestBatchApi {
  getInterestBatchResult(batch: PendingInterestBatch, signal?: AbortSignal): Promise<InterestBatchResponse | undefined>;
  saveInterestBatch(batch: PendingInterestBatch, signal?: AbortSignal): Promise<InterestBatchResponse>;
}
export class InterestBatchError extends Error {
  constructor(readonly kind: 'temporary' | 'blocked', message: string) { super(message); }
}

// 終了時と起動時で同じ手順を使う。現在の記事状態から処理済みと推測せず、回IDの結果を読む。
export class InterestBatchSyncModel {
  constructor(private readonly store: PendingInterestStore, private readonly api: InterestBatchApi) {}
  async send(batch: PendingInterestBatch, signal?: AbortSignal): Promise<InterestBatchResponse> {
    const target = copyBatch(batch); // 再試行しても版・内容を変えない。
    if (!target.articleIds.length) return { batchId: target.batchId, revision: target.revision, results: [] };
    return await this.api.getInterestBatchResult(target,signal) ?? await this.api.saveInterestBatch(target,signal);
  }
  async acknowledge(batch: PendingInterestBatch): Promise<void> {
    // 削除済み記事を含む結果は、画面で案内して利用者が確認してからここへ進む。
    const removed = await this.store.removeIfMatches(batch);
    if (!removed) throw new InterestBatchError('blocked','端末に新しい版が残っています。古い成功結果では削除しません。');
  }
}
