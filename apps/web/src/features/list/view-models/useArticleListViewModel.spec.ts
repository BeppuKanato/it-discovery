import { describe, expect, it, vi } from 'vitest';
import type { ArticlePageResponse, ArticleStateValue } from '@it-discovery/contracts';
import { ArticleOpeningModel } from '../../articles/models/article-opening.model';
import { ArticleListModel } from '../models/article-list.model';
import { ArticleStateModel } from '../../articles/models/article-state.model';
import { ApiError } from '../../../infrastructure/api/api-error';
import { article, page } from '../../../test/article-fixture';
import { useArticleListViewModel } from './useArticleListViewModel';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const getArticlePage = vi.fn().mockResolvedValue(page([2, 1], 'next'));
  const getArticleSources = vi.fn().mockResolvedValue([{ sourceId: 'zenn', siteName: 'Zenn', iconUrl: null }, { sourceId: 'other', siteName: 'Other', iconUrl: null }]);
  const updateArticleState = vi.fn(); const getArticleState = vi.fn();
  const open = vi.fn();
  const vm = useArticleListViewModel(new ArticleListModel({ getArticlePage, getArticleSources }), new ArticleStateModel({ updateArticleState, getArticleState }), new ArticleOpeningModel({ open }));
  return { vm, getArticleSources, getArticlePage, updateArticleState, getArticleState, open };
}
const saved = (state: Partial<ArticleStateValue> = {}) => ({ articleId: 1, state: { ...article(1).state, ...state } });

describe('一覧画面の状態と操作', () => {
  it('生成だけでは取得せず、ページ初期化で20件要求する。一度だけ初期化する', async () => {
    const { vm, getArticlePage } = setup();
    expect(getArticlePage).not.toHaveBeenCalled();
    const pending = vm.initialize(); expect(vm.listLoading.value).toBe('initial');
    await pending; await vm.initialize();
    expect(getArticlePage).toHaveBeenCalledExactlyOnceWith({ kind: 'all', limit: 20 }, expect.any(AbortSignal));
    expect(vm.articles.value.map(a => a.articleId)).toEqual([2, 1]);
    expect(vm.hasMore.value).toBe(true);
  });
  it('追加取得は現在のカーソルを使い、重複取得を防ぎ、記事の重複を除く', async () => {
    const { vm, getArticlePage } = setup(); await vm.initialize();
    const later = deferred<ArticlePageResponse>(); getArticlePage.mockReturnValueOnce(later.promise);
    const loading = vm.loadMoreArticles(); await vm.loadMoreArticles();
    expect(vm.listLoading.value).toBe('append'); expect(getArticlePage).toHaveBeenCalledTimes(2);
    expect(getArticlePage.mock.calls[1]![0]).toEqual({ kind: 'all', limit: 20, cursor: 'next' });
    later.resolve(page([1, 0])); await loading;
    expect(vm.articles.value.map(a => a.articleId)).toEqual([2, 1, 0]); expect(vm.hasMore.value).toBe(false);
  });
  it('フィルターを変えると取得し直し、古いフィルターの遅い応答を捨てる', async () => {
    const { vm, getArticlePage } = setup(); const old = deferred<ArticlePageResponse>();
    getArticlePage.mockReturnValueOnce(old.promise);
    const first = vm.initialize();
    getArticlePage.mockResolvedValueOnce({ ...page([3], 'filtered'), articles: [{ ...article(3), state: { ...article(3).state, interested: true } }] });
    await vm.changeListKind('interested'); old.resolve(page([9])); await first;
    expect(vm.articles.value.map(a => a.articleId)).toEqual([3]);
    getArticlePage.mockResolvedValueOnce(page([])); await vm.loadMoreArticles();
    expect(getArticlePage.mock.lastCall?.[0]).toEqual({ kind: 'interested', limit: 20, cursor: 'filtered' });
    expect((getArticlePage.mock.calls[0]![1] as AbortSignal).aborted).toBe(true);
  });
  it.each(['initial', 'refresh', 'append'] as const)('%s失敗の再試行は同じ取得条件を使い、既存記事を保持する', async mode => {
    const { vm, getArticlePage } = setup();
    if (mode !== 'initial') await vm.initialize();
    getArticlePage.mockRejectedValueOnce(new Error('offline'));
    await (mode === 'initial' ? vm.initialize() : mode === 'refresh' ? vm.refreshArticles() : vm.loadMoreArticles());
    expect(vm.listError.value?.mode).toBe(mode);
    expect(vm.articles.value.length).toBe(mode === 'initial' ? 0 : 2);
    getArticlePage.mockResolvedValueOnce(page([1])); await vm.retryArticleLoad();
    expect(getArticlePage.mock.lastCall?.[0]).toEqual({ kind: 'all', limit: 20, ...(mode === 'append' ? { cursor: 'next' } : {}) });
    expect(vm.listError.value).toBeNull();
  });
  it('取得先切り替え・気になる・追加・更新に同じ条件を使い、遅い応答を混ぜない', async () => {
    const { vm, getArticlePage } = setup(); await vm.initialize();
    const old = deferred<ArticlePageResponse>(); getArticlePage.mockReturnValueOnce(old.promise);
    const previous = vm.refreshArticles();
    getArticlePage.mockResolvedValueOnce(page([3], 'source-next')); await vm.changeSource('zenn');
    old.resolve({ ...page([9]), articles: [{ ...article(9), source: { ...article(9).source, sourceId: 'other' } }] }); await previous;
    expect(vm.articles.value.map(item => item.articleId)).toEqual([3]);
    await vm.loadMoreArticles(); expect(getArticlePage.mock.lastCall?.[0]).toEqual({ kind: 'all', sourceId: 'zenn', limit: 20, cursor: 'source-next' });
    getArticlePage.mockResolvedValueOnce(page([])); await vm.changeListKind('interested');
    expect(getArticlePage.mock.lastCall?.[0]).toEqual({ kind: 'interested', sourceId: 'zenn', limit: 20 });
    await vm.refreshArticles(); expect(getArticlePage.mock.lastCall?.[0].sourceId).toBe('zenn');
    await vm.changeSource(null); expect(getArticlePage.mock.lastCall?.[0]).toEqual({ kind: 'interested', limit: 20 });
  });
  it('保存途中で別取得先へ移っても保存結果から対象外の記事を挿入しない', async () => {
    const { vm, getArticlePage, updateArticleState } = setup(); await vm.initialize();
    const saving = deferred<ReturnType<typeof saved>>(); updateArticleState.mockReturnValueOnce(saving.promise);
    const operation = vm.toggleInterest(1);
    getArticlePage.mockResolvedValue(page([])); await vm.changeListKind('interested'); await vm.changeSource('other');
    saving.resolve(saved({ interested: true })); await operation;
    expect(vm.articles.value).toEqual([]);
  });
  it('取得先の取得失敗は一覧表示を妨げず、選択肢だけ再試行できる', async () => {
    const { vm, getArticleSources, getArticlePage } = setup();
    getArticleSources.mockRejectedValueOnce(new Error('offline')); await vm.initialize();
    expect(vm.articles.value).toHaveLength(2); expect(vm.sourcesError.value).toContain('取得先');
    await vm.loadSources(); expect(vm.sources.value).toHaveLength(2); expect(vm.sourcesError.value).toBeNull();
    expect(getArticlePage).toHaveBeenCalledOnce();
    await vm.changeSource('not-configured'); expect(vm.selectedSourceId.value).toBeNull();
  });
  it('保存成功まで登録値を変えず、同じ記事の二重操作だけを防ぐ', async () => {
    const { vm, updateArticleState } = setup(); await vm.initialize();
    const wait = deferred<ReturnType<typeof saved>>(); updateArticleState.mockReturnValueOnce(wait.promise).mockResolvedValueOnce({ ...saved(), articleId: 2 });
    const saving = vm.togglePin(1);
    expect(vm.savingByArticle.get(1)).toBe('pinned'); expect(vm.articles.value.find(a => a.articleId === 1)?.state.pinned).toBe(false);
    await vm.toggleInterest(1); expect(updateArticleState).toHaveBeenCalledTimes(1);
    await vm.toggleInterest(2); expect(updateArticleState).toHaveBeenCalledTimes(2);
    wait.resolve(saved({ pinned: true })); await saving;
    expect(vm.articles.value.find(a => a.articleId === 1)?.state.pinned).toBe(true); expect(vm.savingByArticle.size).toBe(0);
    expect(updateArticleState.mock.calls[0]!.slice(0, 2)).toEqual([1, { change: { kind: 'pinned', value: true } }]);
  });
  it('保存拒否では元の登録値を残し、GETや自動再送をしない', async () => {
    const { vm, updateArticleState, getArticleState } = setup(); await vm.initialize();
    updateArticleState.mockRejectedValue(new ApiError(403)); await vm.togglePin(1);
    expect(vm.articles.value.find(a => a.articleId === 1)?.state.pinned).toBe(false);
    expect(vm.saveErrors.get(1)?.uncertain).toBe(false); expect(getArticleState).not.toHaveBeenCalled();
    expect(updateArticleState).toHaveBeenCalledTimes(1);
  });
  it('保存結果不明ならGETを一度だけ行い、失敗時は手動確認まで操作を止める', async () => {
    const { vm, updateArticleState, getArticleState } = setup(); await vm.initialize();
    updateArticleState.mockRejectedValue(new ApiError(500)); getArticleState.mockRejectedValueOnce(new ApiError());
    await vm.togglePin(1); expect(vm.saveErrors.get(1)?.uncertain).toBe(true);
    await vm.togglePin(1); expect(updateArticleState).toHaveBeenCalledTimes(1); expect(getArticleState).toHaveBeenCalledTimes(1);
    getArticleState.mockResolvedValueOnce(saved({ pinned: true })); await vm.retryStateCheck(1);
    expect(getArticleState).toHaveBeenCalledTimes(2); expect(updateArticleState).toHaveBeenCalledTimes(1);
    expect(vm.articles.value.find(a => a.articleId === 1)?.state.pinned).toBe(true); expect(vm.saveErrors.get(1)?.uncertain).toBe(false);
  });
  it('404なら記事を除き、遅れて届いた一覧にも復活させない', async () => {
    const { vm, getArticlePage, updateArticleState } = setup(); await vm.initialize();
    const wait = deferred<ArticlePageResponse>(); getArticlePage.mockReturnValueOnce(wait.promise);
    const refresh = vm.refreshArticles(); updateArticleState.mockRejectedValue(new ApiError(404)); await vm.togglePin(1);
    wait.resolve(page([1, 2])); await refresh;
    expect(vm.articles.value.map(a => a.articleId)).toEqual([2]); expect(vm.notice.value).toContain('存在しない');
  });
  it('気になる一覧からの登録解除は成功してから記事を取り除く', async () => {
    const { vm, getArticlePage, updateArticleState } = setup(); await vm.initialize();
    getArticlePage.mockResolvedValueOnce({ ...page([1]), articles: [{ ...article(1), state: { ...article(1).state, interested: true } }] });
    await vm.changeListKind('interested');
    const wait = deferred<ReturnType<typeof saved>>(); updateArticleState.mockReturnValueOnce(wait.promise);
    const saving = vm.toggleInterest(1); expect(vm.articles.value.length).toBe(1);
    wait.resolve(saved()); await saving; expect(vm.articles.value.length).toBe(0);
  });
  it('保存より前に開始した一覧応答で成功済み状態を戻さない', async () => {
    const { vm, getArticlePage, updateArticleState } = setup(); await vm.initialize();
    const wait = deferred<ArticlePageResponse>(); getArticlePage.mockReturnValueOnce(wait.promise);
    const refresh = vm.refreshArticles(); updateArticleState.mockResolvedValueOnce(saved({ pinned: true })); await vm.togglePin(1);
    wait.resolve(page([1])); await refresh; expect(vm.articles.value[0]!.state.pinned).toBe(true);
    getArticlePage.mockResolvedValueOnce(page([1])); await vm.refreshArticles(); expect(vm.articles.value[0]!.state.pinned).toBe(false);
  });
  it('保存待ちの一覧応答でも登録値を先取りしない', async () => {
    const { vm, getArticlePage, updateArticleState } = setup(); await vm.initialize();
    const wait = deferred<ReturnType<typeof saved>>(); updateArticleState.mockReturnValueOnce(wait.promise);
    const saving = vm.togglePin(1);
    getArticlePage.mockResolvedValueOnce({ ...page([1]), articles: [{ ...article(1), state: saved({ pinned: true }).state }] });
    await vm.refreshArticles(); expect(vm.articles.value[0]!.state.pinned).toBe(false);
    wait.resolve(saved({ pinned: true })); await saving; expect(vm.articles.value[0]!.state.pinned).toBe(true);
  });
  it('保存中のフィルター切り替えでも未確定の登録値を先取りしない', async () => {
    const { vm, getArticlePage, updateArticleState } = setup(); await vm.initialize();
    const wait = deferred<ReturnType<typeof saved>>(); updateArticleState.mockReturnValueOnce(wait.promise);
    const saving = vm.toggleInterest(1);
    getArticlePage.mockResolvedValueOnce({ ...page([1]), articles: [{ ...article(1), state: saved({ interested: true }).state }] });
    await vm.changeListKind('interested'); expect(vm.articles.value.length).toBe(0);
    wait.resolve(saved({ interested: true })); await saving;
    expect(vm.articles.value[0]?.state.interested).toBe(true);
  });
  it('ページ終了で通信を中止し、遅い応答から状態を書き換えない', async () => {
    const { vm, getArticlePage, updateArticleState } = setup(); await vm.initialize();
    const list = deferred<ArticlePageResponse>(); const save = deferred<ReturnType<typeof saved>>();
    getArticlePage.mockReturnValueOnce(list.promise); updateArticleState.mockReturnValueOnce(save.promise);
    const refreshing = vm.refreshArticles(); const saving = vm.togglePin(1); vm.dispose();
    expect((getArticlePage.mock.lastCall?.[1] as AbortSignal).aborted).toBe(true);
    expect((updateArticleState.mock.lastCall?.[2] as AbortSignal).aborted).toBe(true);
    list.resolve(page([9])); save.resolve(saved({ pinned: true })); await Promise.all([refreshing, saving]);
    expect(vm.articles.value.map(a => a.articleId)).toEqual([2, 1]); expect(vm.articles.value[1]!.state.pinned).toBe(false);
  });
  it('記事を同期的に開いて既読を表示し、保存を待たず一覧・フィルターを維持する', async () => {
    const { vm, open, updateArticleState, getArticlePage } = setup(); await vm.initialize();
    const wait = deferred<ReturnType<typeof saved>>(); updateArticleState.mockReturnValueOnce(wait.promise);
    const saving = vm.openArticle(1);
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.com/1');
    const openedAt = vm.articles.value.find(a => a.articleId === 1)?.state.lastOpenedAt;
    expect(openedAt).toBeTruthy(); expect(vm.readStatus.get(1)?.phase).toBe('saving');
    expect(vm.articles.value.map(a => a.articleId)).toEqual([2, 1]); expect(vm.selectedKind.value).toBe('all');
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    expect(updateArticleState.mock.calls[0]?.slice(0, 2)).toEqual([1, { change: { kind: 'opened', openedAt } }]);
    expect(vm.articles.value.find(a => a.articleId === 1)?.state.interested).toBe(false);
    wait.resolve(saved({ lastOpenedAt: openedAt! })); await saving; expect(vm.readStatus.has(1)).toBe(false);
  });
  it('開く操作が拒否されたら既読にも登録変更にもせず、理由を通知する', async () => {
    const { vm, open, updateArticleState } = setup(); await vm.initialize(); open.mockImplementationOnce(() => { throw new Error('blocked'); });
    await vm.openArticle(1); expect(updateArticleState).not.toHaveBeenCalled(); expect(vm.readStatus.size).toBe(0);
    expect(vm.articles.value.find(a => a.articleId === 1)?.state.lastOpenedAt).toBeNull(); expect(vm.openingErrors.get(1)).toContain('記事を開けません');
  });
  it.each([403, 500, 404])('既読保存のHTTP %s失敗でも開いた表示を残し、手動でのみ同じ日時を保存し直す', async status => {
    const { vm, open, updateArticleState } = setup(); await vm.initialize();
    updateArticleState.mockRejectedValueOnce(new ApiError(status)); await vm.openArticle(1);
    const failed = vm.readStatus.get(1)!; expect(failed.phase).toBe(status === 500 ? 'uncertain' : 'failed');
    expect(vm.articles.value.length).toBe(2); expect(vm.articles.value.find(a => a.articleId === 1)?.state.lastOpenedAt).toBe(failed.openedAt);
    expect(updateArticleState).toHaveBeenCalledOnce(); updateArticleState.mockResolvedValueOnce(saved({ lastOpenedAt: failed.openedAt }));
    await vm.retryReadSave(1); expect(vm.readStatus.has(1)).toBe(false); expect(open).toHaveBeenCalledTimes(1);
    expect(updateArticleState.mock.calls[1]?.[1]).toEqual({ change: { kind: 'opened', openedAt: failed.openedAt } });
  });
  it('古い一覧・ピン保存応答が開いた日時を戻さず、既読保存応答もピンを戻さない', async () => {
    const { vm, updateArticleState, getArticlePage } = setup(); await vm.initialize();
    const read = deferred<ReturnType<typeof saved>>(); const pin = deferred<ReturnType<typeof saved>>();
    updateArticleState.mockReturnValueOnce(read.promise).mockReturnValueOnce(pin.promise);
    const opening = vm.openArticle(1); const openedAt = vm.readStatus.get(1)!.openedAt; const pinning = vm.togglePin(1);
    getArticlePage.mockResolvedValueOnce(page([1])); await vm.refreshArticles();
    expect(vm.articles.value[0]?.state.lastOpenedAt).toBe(openedAt);
    pin.resolve(saved({ pinned: true })); await pinning; expect(vm.articles.value[0]?.state.lastOpenedAt).toBe(openedAt);
    read.resolve(saved({ lastOpenedAt: openedAt })); await opening;
    expect(vm.articles.value[0]?.state.pinned).toBe(true); expect(vm.articles.value[0]?.state.interested).toBe(false);
  });
  it('連続で記事を開いても古い保存結果で最新の失敗状態を消さない', async () => {
    const { vm, updateArticleState } = setup(); await vm.initialize();
    const old = deferred<ReturnType<typeof saved>>(); updateArticleState.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new ApiError(500));
    const first = vm.openArticle(1); const oldSignal = updateArticleState.mock.calls[0]?.[2] as AbortSignal;
    await vm.openArticle(1); expect(oldSignal.aborted).toBe(true); expect(vm.readStatus.get(1)?.phase).toBe('uncertain');
    old.resolve(saved({ lastOpenedAt: vm.readStatus.get(1)!.openedAt })); await first;
    expect(vm.readStatus.get(1)?.phase).toBe('uncertain');
  });
  it('終了時は既読の通信を中止し、古い失敗を画面へ追加せず、新しいタブも作らない', async () => {
    const { vm, open, updateArticleState } = setup(); await vm.initialize(); const wait = deferred<ReturnType<typeof saved>>();
    updateArticleState.mockReturnValueOnce(wait.promise); const pending = vm.openArticle(1);
    const signal = updateArticleState.mock.calls[0]?.[2] as AbortSignal; vm.dispose(); expect(signal.aborted).toBe(true);
    wait.reject(new ApiError()); await pending; expect(vm.readStatus.get(1)?.phase).toBe('saving');
    await vm.openArticle(1); await vm.retryReadSave(1); expect(open).toHaveBeenCalledOnce(); expect(updateArticleState).toHaveBeenCalledOnce();
  });

});
