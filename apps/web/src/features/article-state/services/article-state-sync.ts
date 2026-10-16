import { createPinia } from 'pinia';
import { useArticleStateStore, type ArticleStateStore, type QueuedStateOperation } from '../models/article-state.store';
import type { ArticleListItem, ArticleStateOperationResponse } from '@it-discovery/contracts';
import { StateRequestError, type ArticleStateApi, type PendingStateOperation, type StateField, type StateOperationStore, type StateProjection } from '../models/state-sync';

interface StorageJob { run(): Promise<void>; done(): void }

// 同期の手順を担当する。記事の状態と表示用の合成は注入されたStoreが管理する。
export class ArticleStateSync implements StateProjection {
  get version() { return this.state.version; }
  get ready() { return this.state.status.ready; }
  get initialized() { return this.state.status.initialized; }
  set initialized(value: boolean) { this.state.updateStatus({ initialized: value }); }
  get notice() { return this.state.status.notice; }
  set notice(value: string) { this.state.updateStatus({ notice: value }); }
  get storageError() { return this.state.status.storageError; }
  set storageError(value: boolean) { this.state.updateStatus({ storageError: value }); }
  get startupError() { return this.state.status.startupError; }
  set startupError(value: string) { this.state.updateStatus({ startupError: value }); }
  get online() { return this.state.status.online; }
  set online(value: boolean) { this.state.updateStatus({ online: value }); }
  private get operations() { return this.state.operations; }
  private jobs: StorageJob[] = [];
  private writing = false;
  private running = new Map<number, AbortController>();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private order = 0;
  private disposed = false;
  private release: (() => void) | null = null;
  private starting = false;

  constructor(
    private readonly api: ArticleStateApi,
    private readonly store: StateOperationStore,
    private readonly acquire: () => Promise<(() => void) | null>,
    private readonly changed: () => void = () => {},
    private readonly makeId: () => string = () => crypto.randomUUID(),
    readonly state: ArticleStateStore = useArticleStateStore(createPinia()),
  ) {}

  get pendingCount(): number { return this.state.pendingCount; }
  get blockedCount(): number { return this.state.blockedCount; }
  get canChange(): boolean { return this.state.canChange; }

  // 最初は所有権と端末保存を確認する。復元した未送信があれば、解消するまで一覧開始を待つ。
  async start(): Promise<void> {
    if (this.starting || this.initialized || this.disposed) return;
    this.starting = true;
    this.startupError = '';
    try {
      this.release ??= await this.acquire();
      if (!this.release) throw new Error('別のタブで操作中です。そのタブを閉じてから再試行してください。');
      const records = await this.store.load();
      if (this.disposed) { this.release?.(); this.release = null; return; }
      for (const record of records) {
        this.order = Math.max(this.order, record.order);

        // 再起動前の要求が処理済みかもしれないため、最初に操作IDの結果を照会する。
        this.state.enqueue(record, true, true);
      }
      this.initialized = true;
      this.updateReady();
      this.pumpAll();
    } catch (error) {
      this.startupError = error instanceof Error ? error.message : '端末の変更を読み込めませんでした。';
    } finally { this.starting = false; this.changed(); }
  }

  // 操作は即時表示する。サーバーへ送るのは端末へのputが完了した後だけ。
  change(article: ArticleListItem, field: StateField): void {
    if (!this.canChange || this.state.entries.get(article.articleId)?.missing) return;
    const current = this.project(article)!;
    const record: PendingStateOperation = {
      // 一覧はVueのreadonlyで包まれる場合があるため、保存用には通常のオブジェクトへ写す。
      order: ++this.order, article: { ...current, source: { ...current.source }, state: { ...current.state } },
      request: { operationId: this.makeId(), change: { kind: field, value: !current.state[field] } },
    };
    const op = this.state.enqueue(record, false, false);
    this.jobs.push({ run: () => this.store.put(copyOperation(record)), done: () => { op.persisted = true; } });
    this.changed();
    void this.drainStorage();
  }

  // 状態の読み取りと表示用の合成はStoreに集約する。
  accept(articles: ArticleListItem[], readVersion: number): void { this.state.accept(articles, readVersion); }
  project(article: ArticleListItem): ArticleListItem | null { return this.state.project(article); }
  supplements(): ArticleListItem[] { return this.state.supplements(); }
  private updateReady(): void { this.state.updateReady(); this.changed(); }

  // 全記事で共有する端末保存の順番。失敗したジョブを先頭に残し、再試行からやり直す。
  private async drainStorage(): Promise<void> {
    if (this.writing || this.storageError || this.disposed) return;
    this.writing = true;
    try {
      while (this.jobs.length && !this.disposed) {
        const job = this.jobs[0]!;
        await job.run();
        if (this.disposed) return;
        this.jobs.shift(); job.done(); this.pumpAll();
      }
    } catch {
      this.storageError = true;
      this.notice = '端末に変更を保存できませんでした。状態変更を停止しています。閉じると失われる変更があります。再試行してください。';
    } finally { this.writing = false; this.changed(); }
  }

  private pumpAll(): void {
    for (const id of new Set(this.operations.map((op) => op.record.article.articleId))) void this.pump(id);
  }

  // 同じ記事では先頭の一件だけ送る。別の記事は互いを待たず送信できる。
  private async pump(articleId: number): Promise<void> {
    if (this.disposed || this.storageError || !this.online || this.running.has(articleId) || this.timers.has(articleId)) return;
    const op = this.operations.find((item) => item.record.article.articleId === articleId);
    if (!op || !op.persisted || op.settled || op.blocked) return;
    const controller = new AbortController();
    this.running.set(articleId, controller);
    try {
      const { request } = op.record;
      let result = op.lookup ? await this.api.getArticleStateOperation(request.operationId, controller.signal) : undefined;
      // 未記録は失敗確定ではない。同じID・内容を再送し、サーバー側で重複を防ぐ。
      result ??= await this.api.applyArticleState(articleId, request, controller.signal);
      if (this.disposed) return;
      if (result.articleId !== articleId || result.operationId !== request.operationId) throw new StateRequestError('blocked', '操作結果が要求と一致しません。');
      this.complete(op, result);
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof StateRequestError && error.kind === 'invalid') {
        this.notice = error.message;
        this.complete(op); // 入力拒否が確定した変更だけを除き、後続の希望状態は残す。
      } else if (error instanceof StateRequestError && error.kind === 'blocked') {
        op.blocked = true; this.notice = error.message;
      } else {
        op.lookup = true;
        const seconds = [1, 2, 4, 8, 16, 30][Math.min(op.attempts++, 5)]!;
        if (this.online) this.timers.set(articleId, setTimeout(() => {
          this.timers.delete(articleId); void this.pump(articleId);
        }, seconds * 1000));
      }
    } finally { this.running.delete(articleId); this.changed(); }
  }

  // 成功した項目だけ確定値へ反映する。応答中の他の項目で、別の判断を上書きしない。
  private complete(op: QueuedStateOperation, result?: ArticleStateOperationResponse): void {
    if (op.settled) return;
    // Storeが状態を確定し、再起動時の基準を直した後続レコードを返す。
    for (const record of this.state.settle(op, result)) {
      this.jobs.push({ run: () => this.store.put(copyOperation(record)), done: () => {} });
    }
    // サーバーで成功しても端末削除が失敗することがある。削除完了まで後続を送らない。
    this.jobs.push({ run: () => this.store.remove(op.record.request.operationId), done: () => {
      this.state.remove(op.record.request.operationId);
      this.updateReady();
    } });
    this.changed();
    void this.drainStorage();
  }

  // 手動再試行は、失敗した端末保存と要確認の操作を再開する。識別子・送信内容は維持する。
  retry(): void {
    if (!this.initialized) { void this.start(); return; }
    this.storageError = false; this.notice = '';
    for (const op of this.operations) { op.blocked = false; if (op.persisted) op.lookup = true; }
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    void this.drainStorage(); this.pumpAll(); this.changed();
  }

  // 自動解消できない操作だけを、利用者の明示操作で破棄する。サーバーの状態を反転しない。
  discardBlocked(): void {
    for (const op of this.operations.filter((item) => item.blocked)) this.complete(op);
    this.notice = '要確認の変更を端末から破棄しました。サーバーの状態は一覧の更新で確認してください。';
    this.changed();
  }

  setOnline(value: boolean): void {
    this.online = value;
    if (!value) {
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
    } else this.pumpAll();
    this.changed();
  }

  dispose(): void {
    this.disposed = true;
    this.state.updateStatus({ stopped: true });
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
function copyOperation(record: PendingStateOperation): PendingStateOperation {
  return { order: record.order,
    article: { ...record.article, source: { ...record.article.source }, state: { ...record.article.state } },
    request: { operationId: record.request.operationId, change: { ...record.request.change } },
  };
}
