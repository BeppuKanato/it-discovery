import type { ArticleDataStore } from '../../articles/models/article-data.store';
import { type ArticleChangeStore, type TrackedArticleChange } from './article-change.store';
import type { ArticleStateOperationResponse } from '@it-discovery/contracts';
import { ArticleChangeRequestError, type ArticleChangeApi, type UnfinishedArticleChange, type StateField, type UnfinishedArticleChangeStorage } from './article-change-contracts';

interface StorageJob { run(): Promise<void>; done(): void }

// 同期の手順を担当する。記事の状態と表示用の合成は注入されたStoreが管理する。
export class ArticleChangeSyncModel {
  private jobs: StorageJob[] = [];
  private writing = false;
  private running = new Map<number, AbortController>();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private order = 0;
  private disposed = false;
  private release: (() => void) | null = null;
  private starting = false;

  constructor(
    private readonly api: ArticleChangeApi,
    private readonly operationStore: UnfinishedArticleChangeStorage,
    private readonly acquire: () => Promise<(() => void) | null>,
    readonly changes: ArticleChangeStore,
    readonly articles: ArticleDataStore,
    private readonly makeId: () => string = () => crypto.randomUUID(),
  ) {}

  // 最初は所有権と端末保存を確認する。復元した未送信があれば、解消するまで一覧開始を待つ。
  async restoreAndSyncUnfinishedChanges(): Promise<void> {
    if (this.starting || this.changes.syncStatus.storageRestored || this.disposed) return;
    this.starting = true;
    this.changes.updateSyncStatus({ startupError: '' });
    try {
      this.release ??= await this.acquire();
      if (!this.release) throw new Error('別のタブで操作中です。そのタブを閉じてから再試行してください。');
      const records = await this.operationStore.load();
      if (this.disposed) { this.release?.(); this.release = null; return; }
      for (const record of records) {
        this.order = Math.max(this.order, record.order);

        // 再起動前の要求が処理済みかもしれないため、最初に操作IDの結果を照会する。
        this.trackArticleChange(record, true, true);
      }
      this.changes.updateSyncStatus({ storageRestored: true });
      this.updateStartupSyncComplete();
      this.sendNextChangesForAllArticles();
    } catch (error) {
      this.changes.updateSyncStatus({ startupError: error instanceof Error ? error.message : '端末の変更を読み込めませんでした。' });
    } finally { this.starting = false; }
  }

  // 操作は即時表示する。サーバーへ送るのは端末へのputが完了した後だけ。
  setArticleState(articleId: number, field: StateField, value: boolean): void {
    if (!this.changes.canChangeArticles) return;
    const current = this.readArticle(articleId);
    if (!current) return;
    const record: UnfinishedArticleChange = {
      // 一覧はVueのreadonlyで包まれる場合があるため、保存用には通常のオブジェクトへ写す。
      order: ++this.order, article: { ...current, source: { ...current.source }, state: { ...current.state } },
      request: { operationId: this.makeId(), change: { kind: field, value } },
    };
    const op = this.trackArticleChange(record, false, false);
    this.jobs.push({ run: () => this.operationStore.put(copyOperation(record)), done: () => this.changes.markPersisted(op) });

    void this.drainStorage();
  }

  // 呼び出し側は記事データと未確定変更の合成手順を知らなくてよい。
  readArticle(articleId: number) {
    return this.changes.applyUnfinishedChanges(this.articles.getConfirmedArticle(articleId));
  }

  private trackArticleChange(record: UnfinishedArticleChange, persisted: boolean, lookup: boolean): TrackedArticleChange {
    this.articles.rememberArticle(record.article);
    this.articles.markFieldChanged(record.article.articleId, record.request.change.kind);
    return this.changes.trackChange(record, persisted, lookup);
  }

  private updateStartupSyncComplete(): void { this.changes.updateStartupSyncComplete(); }

  // 全記事で共有する端末保存の順番。失敗したジョブを先頭に残し、再試行からやり直す。
  private async drainStorage(): Promise<void> {
    if (this.writing || this.changes.syncStatus.storageError || this.disposed) return;
    this.writing = true;
    try {
      while (this.jobs.length && !this.disposed) {
        const job = this.jobs[0]!;
        await job.run();
        if (this.disposed) return;
        this.jobs.shift(); job.done(); this.sendNextChangesForAllArticles();
      }
    } catch {
      this.changes.updateSyncStatus({ storageError: true, notice: '端末に変更を保存できませんでした。状態変更を停止しています。閉じると失われる変更があります。再試行してください。' });
    } finally { this.writing = false; }
  }

  private sendNextChangesForAllArticles(): void {
    for (const id of new Set(this.changes.unfinishedChanges.map((op) => op.record.article.articleId))) void this.sendNextChangeForArticle(id);
  }

  // 同じ記事では先頭の一件だけ送る。別の記事は互いを待たず送信できる。
  private async sendNextChangeForArticle(articleId: number): Promise<void> {
    if (this.disposed || this.changes.syncStatus.storageError || !this.changes.syncStatus.online || this.running.has(articleId) || this.timers.has(articleId)) return;
    const op = this.changes.unfinishedChanges.find((item) => item.record.article.articleId === articleId);
    if (!op || !op.persisted || op.settled || op.blocked) return;
    const controller = new AbortController();
    this.running.set(articleId, controller);
    try {
      const { request } = op.record;
      let result = op.lookup ? await this.api.getArticleStateOperation(request.operationId, controller.signal) : undefined;
      // 未記録は失敗確定ではない。同じID・内容を再送し、サーバー側で重複を防ぐ。
      result ??= await this.api.applyArticleState(articleId, request, controller.signal);
      if (this.disposed) return;
      if (result.articleId !== articleId || result.operationId !== request.operationId) throw new ArticleChangeRequestError('blocked', '操作結果が要求と一致しません。');
      this.complete(op, result);
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof ArticleChangeRequestError && error.kind === 'invalid') {
        this.changes.updateSyncStatus({ notice: error.message });
        this.complete(op); // 入力拒否が確定した変更だけを除き、後続の希望状態は残す。
      } else if (error instanceof ArticleChangeRequestError && error.kind === 'blocked') {
        this.changes.markBlocked(op, error.message);
      } else {
        const attempt = this.changes.recordRetry(op);
        const seconds = [1, 2, 4, 8, 16, 30][Math.min(attempt, 5)]!;
        if (this.changes.syncStatus.online) this.timers.set(articleId, setTimeout(() => {
          this.timers.delete(articleId); void this.sendNextChangeForArticle(articleId);
        }, seconds * 1000));
      }
    } finally { this.running.delete(articleId); }
  }

  // 成功した項目だけ確定値へ反映する。応答中の他の項目で、別の判断を上書きしない。
  private complete(op: TrackedArticleChange, result?: ArticleStateOperationResponse): void {
    if (op.settled) return;
    // Storeが状態を確定し、再起動時の基準を直した後続レコードを返す。
    const articleId = op.record.article.articleId;
    const field = op.record.request.change.kind;
    if (result?.status === 'saved') this.articles.confirmField(articleId, field, result.state);
    if (result?.status === 'missing') {
      this.articles.markRemoved(articleId);
      this.changes.updateSyncStatus({ notice: '保持されていない記事があったため、その記事の変更は登録できませんでした。' });
    }
    this.articles.markFieldChanged(articleId, field);
    const confirmedState = this.articles.getConfirmedArticle(articleId)?.state ?? op.record.article.state;
    for (const record of this.changes.settleChange(op, confirmedState)) {
      this.jobs.push({ run: () => this.operationStore.put(copyOperation(record)), done: () => {} });
    }
    // サーバーで成功しても端末削除が失敗することがある。削除完了まで後続を送らない。
    this.jobs.push({ run: () => this.operationStore.remove(op.record.request.operationId), done: () => {
      this.changes.removeCompletedChange(op.record.request.operationId);
      this.updateStartupSyncComplete();
    } });

    void this.drainStorage();
  }

  // 手動再試行は、失敗した端末保存と要確認の操作を再開する。識別子・送信内容は維持する。
  retryUnfinishedChanges(): void {
    if (!this.changes.syncStatus.storageRestored) { void this.restoreAndSyncUnfinishedChanges(); return; }
    this.changes.prepareRetry();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    void this.drainStorage(); this.sendNextChangesForAllArticles();
  }

  // 自動解消できない操作だけを、利用者の明示操作で破棄する。サーバーの状態を反転しない。
  discardBlockedChanges(): void {
    for (const op of this.changes.unfinishedChanges.filter((item) => item.blocked)) this.complete(op);
    this.changes.updateSyncStatus({ notice: '要確認の変更を端末から破棄しました。サーバーの状態は一覧の更新で確認してください。' });
  }

  setOnline(value: boolean): void {
    this.changes.updateSyncStatus({ online: value });
    if (!value) {
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
    } else this.sendNextChangesForAllArticles();
  }

  dispose(): void {
    this.disposed = true;
    this.changes.updateSyncStatus({ stopped: true });
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const controller of this.running.values()) controller.abort();
    // IndexedDBへの処理中の書き込みが終わってから所有権を渡す。
    // 未送信の保存済み記録は消さず、次回は結果照会から再開する。
    const releaseWhenIdle = () => {
      if (this.writing || this.running.size) { setTimeout(releaseWhenIdle, 10); return; }
      this.release?.(); this.release = null;
    };
    releaseWhenIdle();
  }
}

// Piniaが追跡するProxyを、IndexedDBへ渡せる通常のデータへ写す。
// 全フィールドがJSON用の値なので、関数やブラウザAPIの実体は含まれない。
function copyOperation(record: UnfinishedArticleChange): UnfinishedArticleChange {
  return { order: record.order,
    article: { ...record.article, source: { ...record.article.source }, state: { ...record.article.state } },
    request: { operationId: record.request.operationId, change: { ...record.request.change } },
  };
}
