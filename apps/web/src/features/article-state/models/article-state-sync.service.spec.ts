import { useArticleStateStore } from './article-state.store';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleStateOperationResponse, ArticleStateMutationRequest } from '@it-discovery/contracts';
import { article } from '../../../test/article-fixture';
import { ArticleStateSyncService } from './article-state-sync.service';
import { StateRequestError, type ArticleStateApi, type PendingStateOperation, type StateOperationStore } from './state-sync';

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
// 端末保存→送信→端末削除のPromiseを進める。タイマーによる再試行は勝手に進めない。
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function saved(articleId: number, request: ArticleStateMutationRequest): ArticleStateOperationResponse {
  const state = { ...article(articleId).state };
  if (request.change.kind !== 'opened') state[request.change.kind] = request.change.value;
  return { operationId: request.operationId, articleId, status: 'saved', state };
}

describe('一覧変更の即時反映・順序・再送', () => {
  let api: ArticleStateApi;
  let store: StateOperationStore;
  let sync: ArticleStateSyncService;
  let disk: Map<string, PendingStateOperation>;
  const active: ArticleStateSyncService[] = [];
  beforeEach(async () => {
    vi.useFakeTimers(); disk = new Map();
    api = {
      applyArticleState: vi.fn(async (id, request) => saved(id, request)),
      getArticleStateOperation: vi.fn().mockResolvedValue(undefined),
    };
    store = {
      load: vi.fn(async () => [...disk.values()].map((op) => structuredClone(op))),
      put: vi.fn(async (op) => { disk.set(op.request.operationId, structuredClone(op)); }),
      remove: vi.fn(async (id) => { disk.delete(id); }),
    };
    sync = new ArticleStateSyncService(api, store, async () => () => {}, useArticleStateStore(createPinia())); active.push(sync);
    await sync.start();
  });
  afterEach(() => { for (const item of active.splice(0)) item.dispose(); vi.clearAllTimers(); vi.useRealTimers(); });

  it('端末保存を待つ間も即時表示し、保存完了前には送信しない', async () => {
    const write = deferred<void>(); vi.mocked(store.put).mockReturnValueOnce(write.promise);
    toggle(sync, article(1), 'interested');
    expect(sync.state.project(article(1))?.state.interested).toBe(true);
    expect(api.applyArticleState).not.toHaveBeenCalled();
    write.resolve(); await flush();
    expect(api.applyArticleState).toHaveBeenCalledTimes(1);
    expect(sync.state.pendingCount).toBe(0);
  });

  it('同じ記事の登録・解除・ピンを順番に送り、表示は最後の希望にする', async () => {
    const response = deferred<ArticleStateOperationResponse>();
    vi.mocked(api.applyArticleState).mockReturnValueOnce(response.promise);
    toggle(sync, article(1), 'interested'); await flush();
    toggle(sync, article(1), 'interested'); toggle(sync, article(1), 'pinned'); await flush();
    expect(api.applyArticleState).toHaveBeenCalledTimes(1);
    expect(sync.state.project(article(1))?.state).toMatchObject({ interested: false, pinned: true });
    const first = vi.mocked(api.applyArticleState).mock.calls[0]!;
    response.resolve(saved(1, first[1])); await flush();
    expect(vi.mocked(api.applyArticleState).mock.calls.map((call) => call[1].change)).toEqual([
      { kind: 'interested', value: true }, { kind: 'interested', value: false }, { kind: 'pinned', value: true },
    ]);
    expect(sync.state.project(article(1))?.state).toMatchObject({ interested: false, pinned: true });
    expect(sync.state.pendingCount).toBe(0); expect(disk.size).toBe(0);
  });

  it('別の記事は遅い記事を待たず保存する', async () => {
    vi.mocked(api.applyArticleState).mockReturnValueOnce(deferred<ArticleStateOperationResponse>().promise);
    toggle(sync, article(1), 'interested'); await flush();
    toggle(sync, article(2), 'pinned'); await flush();
    expect(api.applyArticleState).toHaveBeenCalledTimes(2);
    expect(sync.state.pendingCount).toBe(1);
  });

  it('古い拒否で新しい操作や別項目・別記事の変更を戻さない', async () => {
    const response = deferred<ArticleStateOperationResponse>();
    vi.mocked(api.applyArticleState).mockReturnValueOnce(response.promise);
    toggle(sync, article(1), 'interested'); await flush();
    toggle(sync, article(1), 'interested'); toggle(sync, article(1), 'interested');
    toggle(sync, article(1), 'pinned'); toggle(sync, article(2), 'pinned'); await flush();
    response.reject(new StateRequestError('invalid', '拒否')); await flush();
    expect(sync.state.project(article(1))?.state).toMatchObject({ interested: true, pinned: true });
    expect(sync.state.project(article(2))?.state.pinned).toBe(true);
    expect(sync.state.pendingCount).toBe(0);
  });

  it('応答不明で表示を戻さず、結果確認できればPUTを再実行しない', async () => {
    vi.mocked(api.applyArticleState).mockRejectedValueOnce(new Error('timeout'));
    toggle(sync, article(1), 'interested'); await flush();
    const request = vi.mocked(api.applyArticleState).mock.calls[0]![1];
    vi.mocked(api.getArticleStateOperation).mockResolvedValueOnce(saved(1, request));
    expect(sync.state.project(article(1))?.state.interested).toBe(true);
    expect(sync.state.pendingCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(api.getArticleStateOperation).toHaveBeenCalledWith(request.operationId, expect.any(AbortSignal));
    expect(api.applyArticleState).toHaveBeenCalledTimes(1);
    expect(sync.state.pendingCount).toBe(0);
  });

  it('結果未記録なら同じID・同じ内容で再送し、後続は確定まで待つ', async () => {
    vi.mocked(api.applyArticleState).mockRejectedValueOnce(new Error('offline'));
    toggle(sync, article(1), 'interested'); await flush();
    toggle(sync, article(1), 'pinned'); await flush();
    const original = vi.mocked(api.applyArticleState).mock.calls[0]![1];
    expect(api.applyArticleState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(vi.mocked(api.applyArticleState).mock.calls[1]![1]).toEqual(original);
    expect(api.applyArticleState).toHaveBeenCalledTimes(3);
    expect(sync.state.pendingCount).toBe(0);
  });

  it('通信失敗は1・2・4秒と間隔を広げ、オフライン中は送らない', async () => {
    vi.mocked(api.applyArticleState).mockRejectedValue(new Error('network'));
    toggle(sync, article(1), 'interested'); await flush();
    await vi.advanceTimersByTimeAsync(999); expect(api.applyArticleState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await flush(); expect(api.applyArticleState).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999); expect(api.applyArticleState).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); await flush(); expect(api.applyArticleState).toHaveBeenCalledTimes(3);
    sync.setOnline(false); await vi.advanceTimersByTimeAsync(60_000); expect(api.applyArticleState).toHaveBeenCalledTimes(3);
    sync.setOnline(true); await flush(); expect(api.applyArticleState).toHaveBeenCalledTimes(4);
  });

  it('端末保存失敗は変更操作と送信を止め、再試行で保存してから送る', async () => {
    vi.mocked(store.put).mockRejectedValueOnce(new Error('quota'));
    toggle(sync, article(1), 'interested'); await flush();
    expect(sync.state.status.storageError).toBe(true); expect(sync.state.canChange).toBe(false);
    toggle(sync, article(2), 'pinned'); expect(sync.state.pendingCount).toBe(1);
    expect(api.applyArticleState).not.toHaveBeenCalled();
    sync.retry(); await flush();
    expect(sync.state.status.storageError).toBe(false); expect(sync.state.pendingCount).toBe(0);
    expect(api.applyArticleState).toHaveBeenCalledTimes(1);
  });

  it('成功後の端末削除失敗でも後続を送らず、削除の再試行だけで進める', async () => {
    vi.mocked(store.remove).mockRejectedValueOnce(new Error('disk'));
    toggle(sync, article(1), 'interested'); await flush();
    expect(sync.state.status.storageError).toBe(true); expect(disk.size).toBe(1);
    sync.retry(); await flush();
    expect(sync.state.pendingCount).toBe(0); expect(disk.size).toBe(0);
    expect(api.applyArticleState).toHaveBeenCalledTimes(1);
  });

  it('再起動時は未送信を照会し、解消前には通常操作を始めない', async () => {
    sync.setOnline(false); toggle(sync, article(1), 'pinned'); await flush();
    const record = [...disk.values()][0]!;
    sync.dispose();
    const pending = deferred<ArticleStateOperationResponse>();
    vi.mocked(api.getArticleStateOperation).mockReturnValueOnce(pending.promise);
    const reopened = new ArticleStateSyncService(api, store, async () => () => {}, useArticleStateStore(createPinia())); active.push(reopened);
    await reopened.start();
    expect(reopened.state.status.ready).toBe(false); expect(reopened.state.canChange).toBe(false);
    pending.resolve(saved(1, record.request)); await flush();
    expect(reopened.state.status.ready).toBe(true); expect(reopened.state.pendingCount).toBe(0);
    expect(api.applyArticleState).not.toHaveBeenCalled();
  });

  it('先行が拒否された後の再起動では、後続の復元基準にも拒否を反映する', async () => {
    const first = deferred<ArticleStateOperationResponse>();
    const second = deferred<ArticleStateOperationResponse>();
    vi.mocked(api.applyArticleState).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    toggle(sync, article(1), 'interested'); await flush();
    toggle(sync, article(1), 'interested'); await flush();
    first.reject(new StateRequestError('invalid', '拒否')); await flush();
    expect([...disk.values()][0]!.article.state.interested).toBe(false);
    sync.dispose(); second.reject(new Error('closed')); await flush();
    vi.mocked(api.applyArticleState).mockRejectedValueOnce(new StateRequestError('invalid', '拒否'));
    const reopened = new ArticleStateSyncService(api, store, async () => () => {}, useArticleStateStore(createPinia())); active.push(reopened);
    await reopened.start(); await flush();
    expect(reopened.state.project(article(1))?.state.interested).toBe(false);
  });

  it('古い一覧応答は確定後も巻き戻さず、その後に開始した取得は受け入れる', async () => {
    const readVersion = sync.state.version;
    toggle(sync, article(1), 'interested'); await flush();
    sync.state.accept([article(1)], readVersion);
    expect(sync.state.project(article(1))?.state.interested).toBe(true);
    sync.state.accept([article(1)], sync.state.version);
    expect(sync.state.project(article(1))?.state.interested).toBe(false);
  });

  it('認証・競合は自動再送を止め、利用者が破棄するまで端末に残す', async () => {
    vi.mocked(api.applyArticleState).mockRejectedValueOnce(new StateRequestError('blocked', '要確認'));
    toggle(sync, article(1), 'interested'); await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync.state.blockedCount).toBe(1); expect(disk.size).toBe(1);
    expect(api.applyArticleState).toHaveBeenCalledTimes(1);
    sync.discardBlocked(); await flush();
    expect(sync.state.project(article(1))?.state.interested).toBe(false); expect(disk.size).toBe(0);
  });

  it('別の記事の照会結果は適用せず、未送信変更を残す', async () => {
    vi.mocked(api.applyArticleState).mockRejectedValueOnce(new Error('network'));
    toggle(sync, article(1), 'interested'); await flush();
    const request = vi.mocked(api.applyArticleState).mock.calls[0]![1];
    vi.mocked(api.getArticleStateOperation).mockResolvedValueOnce(saved(2, request));
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(sync.state.blockedCount).toBe(1); expect(sync.state.pendingCount).toBe(1);
    expect(sync.state.project(article(1))?.state.interested).toBe(true);
  });

  it('削除済みは通知して解消し、記事を再作成しない', async () => {
    vi.mocked(api.applyArticleState).mockImplementationOnce(async (id, request) => ({ operationId: request.operationId, articleId: id, status: 'missing', state: null }));
    toggle(sync, article(1), 'interested'); await flush();
    expect(sync.state.project(article(1))).toBeNull(); expect(sync.state.pendingCount).toBe(0);
    expect(sync.state.status.notice).toContain('登録できません');
  });

  it('別タブの所有権がある場合は端末を読まず、再試行で取得できる', async () => {
    const acquire = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(() => {});
    const other = new ArticleStateSyncService(api, store, acquire, useArticleStateStore(createPinia())); active.push(other);
    vi.mocked(store.load).mockClear();
    await other.start(); expect(other.state.status.ready).toBe(false); expect(store.load).not.toHaveBeenCalled();
    expect(other.state.status.startupError).toContain('別のタブ');
    other.retry(); await flush(); expect(other.state.status.ready).toBe(true);
  });

  it('端末の読み込み失敗を空キューとみなさず、再試行を待つ', async () => {
    vi.mocked(store.load).mockRejectedValueOnce(new Error('読み込み失敗'));
    const other = new ArticleStateSyncService(api, store, async () => () => {}, useArticleStateStore(createPinia())); active.push(other);
    await other.start(); expect(other.state.status.ready).toBe(false); expect(other.state.status.startupError).toContain('失敗');
    other.retry(); await flush(); expect(other.state.status.ready).toBe(true);
  });

  it('終了後の遅い応答では端末記録を消さず、次回の照会用に残す', async () => {
    const response = deferred<ArticleStateOperationResponse>();
    vi.mocked(api.applyArticleState).mockReturnValueOnce(response.promise);
    toggle(sync, article(1), 'interested'); await flush();
    const call = vi.mocked(api.applyArticleState).mock.calls[0]!;
    sync.dispose(); expect(call[2]?.aborted).toBe(true);
    response.resolve(saved(1, call[1])); await flush();
    expect(disk.size).toBe(1); expect(store.remove).not.toHaveBeenCalled();
  });
});

function toggle(sync: ArticleStateSyncService, item: ReturnType<typeof article>, field: 'pinned' | 'interested'): void {
  if (!sync.state.entries.has(item.articleId)) sync.state.accept([item], sync.state.version);
  const current = sync.state.getArticle(item.articleId);
  if (current) sync.setState(item.articleId, field, !current.state[field]);
}
