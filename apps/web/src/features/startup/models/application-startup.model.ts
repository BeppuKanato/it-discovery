import type { SortingModel } from '../../sorting/models/sorting.model';
import { InterestBatchError, type InterestBatchSyncModel } from '../../sorting/models/interest-batch-sync.model';
import type { PendingInterestBatch, PendingInterestStore } from '../../sorting/models/pending-interest';
export interface ApplicationLease { acquire(): Promise<boolean>; release(): void }
export interface StartupStore extends PendingInterestStore { readDay(): Promise<string | null>; writeDay(day: string): Promise<void>; close(): Promise<void> }

// アプリ全体の起動に必要な手順の窓口。一覧そのものの初回取得は一覧Pageが持つ。
export class ApplicationStartupModel {
  constructor(private readonly lease: ApplicationLease, private readonly store: StartupStore,
    private readonly sync: InterestBatchSyncModel, private readonly sorting: SortingModel, private readonly clock = () => new Date()) {}
  acquireLease(): Promise<boolean> { return this.lease.acquire(); }
  async restorePending(): Promise<PendingInterestBatch[]> {
    try { return await this.store.loadAll(); }
    catch { throw new InterestBatchError('blocked','端末の仕分け記録を読み出せません。記録は削除していません。接続・保存領域・アプリの版を確認して再試行してください。'); }
  }
  send(batch: PendingInterestBatch, signal?: AbortSignal) { return this.sync.send(batch,signal); }
  async acknowledge(batch: PendingInterestBatch): Promise<void> {
    try { await this.sync.acknowledge(batch); }
    catch (error) { if (error instanceof InterestBatchError) throw error; throw new InterestBatchError('temporary','保存済み結果の端末解消に失敗しました。記録を残して再試行します。'); }
  }
  // 永久エラーの明示的な破棄も、確認対象の版だけに限定する。自動では呼ばない。
  discard(batch: PendingInterestBatch): Promise<void> { return this.acknowledge(batch); }
  async checkDaily(signal?: AbortSignal) {
    const day = new Date(this.clock().getTime()+9*60*60*1000).toISOString().slice(0,10);
    try {
      if (await this.store.readDay() === day) return { articles: [], notice: null };
      const result = await this.sorting.getCandidates(signal);
      await this.store.writeDay(day); // 0件も判定済み。失敗なら自動開始せず手動へ案内する。
      return { articles: result.articles, notice: null };
    } catch {
      return { articles: [], notice: '今日の自動仕分けを確認できませんでした。一覧から手動で仕分けを開始できます。' };
    }
  }
  release(): void { this.lease.release(); }
  dispose(): void { this.release(); void this.store.close().catch(() => {}); }
}
