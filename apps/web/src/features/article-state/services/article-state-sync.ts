import type { ArticleListItem, ArticleStateOperationResponse, ArticleStateValue } from '@it-discovery/contracts';
import { StateRequestError, type ArticleStateApi, type PendingStateOperation, type StateField, type StateOperationStore, type StateProjection } from '../models/state-sync';

interface QueuedOperation {
  record: PendingStateOperation;
  persisted: boolean;
  lookup: boolean;
  settled: boolean;
  blocked: boolean;
  attempts: number;
}
interface ArticleEntry {
  article: ArticleListItem;
  confirmed: ArticleStateValue;
  // 項目ごとに、最後に変更した時点を持つ。古い一覧応答で確定値を戻さないために使う。
  fields: Partial<Record<StateField, number>>;
  missing: boolean;
}
interface StorageJob { run(): Promise<void>; done(): void }

// VueやAxiosに依存せず、端末保存・記事ごとの送信順・再送・希望状態の合成を担当する。
export class ArticleStateSync implements StateProjection {
  version = 0;
  ready = false;
  initialized = false;
  notice = '';
  storageError = false;
  startupError = '';
  online = true;
  private operations: QueuedOperation[] = [];
  private entries = new Map<number, ArticleEntry>();
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
  ) {}

  get pendingCount(): number { return this.operations.length; }
  get blockedCount(): number { return this.operations.filter((op) => op.blocked).length; }
  get canChange(): boolean { return this.ready && !this.storageError && !this.disposed; }

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
        this.remember(record.article);
        this.entries.get(record.article.articleId)!.fields[record.request.change.kind] = ++this.version;
        // 再起動前の要求が処理済みかもしれないため、最初に操作IDの結果を照会する。
        this.operations.push({ record, persisted: true, lookup: true, settled: false, blocked: false, attempts: 0 });
      }
      this.initialized = true;
      this.updateReady();
      this.pumpAll();
    } catch (error) {
      this.startupError = error instanceof Error ? error.message : '端末の変更を読み込めませんでした。';
    } finally { this.starting = false; this.changed(); }
  }

  private remember(article: ArticleListItem): ArticleEntry {
    let entry = this.entries.get(article.articleId);
    if (!entry) {
      entry = { article, confirmed: { ...article.state }, fields: {}, missing: false };
      this.entries.set(article.articleId, entry);
    }
    return entry;
  }

  // 操作は即時表示する。サーバーへ送るのは端末へのputが完了した後だけ。
  change(article: ArticleListItem, field: StateField): void {
    if (!this.canChange || this.entries.get(article.articleId)?.missing) return;
    const entry = this.remember(article);
    const current = this.project(article)!;
    const record: PendingStateOperation = {
      // 一覧はVueのreadonlyで包まれる場合があるため、保存用には通常のオブジェクトへ写す。
      order: ++this.order, article: { ...current, source: { ...current.source }, state: { ...current.state } },
      request: { operationId: this.makeId(), change: { kind: field, value: !current.state[field] } },
    };
    entry.fields[field] = ++this.version;
    const op: QueuedOperation = { record, persisted: false, lookup: false, settled: false, blocked: false, attempts: 0 };
    this.operations.push(op);
    this.jobs.push({ run: () => this.store.put(record), done: () => { op.persisted = true; } });
    this.changed();
    void this.drainStorage();
  }

  // 一覧取得の開始時点より後の操作と、未確定の変更を古いDB状態で上書きしない。
  accept(articles: ArticleListItem[], readVersion: number): void {
    for (const article of articles) {
      const entry = this.entries.get(article.articleId);
      if (!entry) continue;
      entry.article = article;
      for (const field of ['interested', 'pinned'] as const) {
        const pending = this.operations.some((op) => !op.settled && op.record.article.articleId === article.articleId && op.record.request.change.kind === field);
        if (!pending && readVersion >= (entry.fields[field] ?? 0)) entry.confirmed[field] = article.state[field];
      }
    }
  }

  // 確定値へ未送信操作を順番に重ねる。後続操作があれば古い成功・失敗でも希望を消さない。
  project(article: ArticleListItem): ArticleListItem | null {
    const entry = this.entries.get(article.articleId);
    if (!entry) return article;
    if (entry.missing) return null;
    const state = { ...article.state };
    for (const field of ['interested', 'pinned'] as const) {
      if (entry.fields[field] !== undefined) state[field] = entry.confirmed[field];
    }
    for (const op of this.operations) {
      if (!op.settled && op.record.article.articleId === article.articleId) {
        state[op.record.request.change.kind] = op.record.request.change.value;
      }
    }
    return { ...article, state };
  }

  // 気になる一覧から即時に消えたカードも保持し、確定失敗時に並び順を計算し直して復元する。
  supplements(): ArticleListItem[] {
    return [...this.entries.values()].filter((entry) => !entry.missing && entry.fields.interested !== undefined).map((entry) => entry.article);
  }

  private updateReady(): void {
    if (this.initialized && this.operations.length === 0) this.ready = true;
    this.changed();
  }

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
  private complete(op: QueuedOperation, result?: ArticleStateOperationResponse): void {
    if (op.settled) return;
    const entry = this.entries.get(op.record.article.articleId)!;
    const field = op.record.request.change.kind;
    if (result?.status === 'saved') entry.confirmed[field] = result.state[field];
    if (result?.status === 'missing') { entry.missing = true; this.notice = '保持されていない記事があったため、その記事の変更は登録できませんでした。'; }
    entry.fields[field] = ++this.version;
    op.settled = true;
    op.blocked = false;
    // 後続の保存用カードには、直前までの確定値を残す。
    // 例えば先行の登録が拒否された後に再起動しても、拒否前の希望値を復元の基準にしない。
    for (const later of this.operations) {
      if (later === op || later.record.article.articleId !== op.record.article.articleId) continue;
      later.record.article = { ...later.record.article, state: { ...entry.confirmed } };
      this.jobs.push({ run: () => this.store.put(later.record), done: () => {} });
    }
    // サーバーで成功しても端末削除が失敗することがある。削除完了まで後続を送らない。
    this.jobs.push({ run: () => this.store.remove(op.record.request.operationId), done: () => {
      this.operations = this.operations.filter((item) => item !== op);
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
