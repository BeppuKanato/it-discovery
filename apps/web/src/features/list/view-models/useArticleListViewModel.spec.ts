import { useArticleDataStore } from '../../articles/models/article-data.store';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import { useArticleChangeStore } from '../../article-changes/models/article-change.store';
import { describe, expect, it, vi } from 'vitest';
import type { ArticlePageResponse } from '@it-discovery/contracts';
import type { ArticleListApi } from '../models/article-list-api';
import { page } from '../../../test/article-fixture';
import { useArticleListViewModel } from './useArticleListViewModel';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('記事一覧の取得と競合', () => {
  it('全記事を先頭20件から要求し、記事と続き位置を表示する', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>().mockResolvedValue(page([1, 2], 'next'));
    const list = createList({ getArticlePage });
    await list.refresh();
    expect(getArticlePage).toHaveBeenCalledWith({ kind: 'all', limit: 20 }, expect.any(AbortSignal));
    expect(list.articles.value.map((item) => item.articleId)).toEqual([2, 1]);
    expect(list.nextCursor.value).toBe('next');
    expect(list.canLoadMore.value).toBe(true);
  });

  it('追加中の重複要求と終端の要求を止め、記事IDで重複を除く', async () => {
    const pending = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1, 2], 'next')).mockReturnValueOnce(pending.promise);
    const list = createList({ getArticlePage });
    await list.refresh();
    const append = list.loadMore();
    await list.loadMore();
    expect(getArticlePage).toHaveBeenCalledTimes(2);
    pending.resolve(page([2, 3]));
    await append;
    await list.loadMore();
    expect(list.articles.value.map((item) => item.articleId)).toEqual([3, 2, 1]);
    expect(getArticlePage).toHaveBeenCalledTimes(2);
    expect(list.hasMore.value).toBe(false);
  });

  it('追加失敗で記事とカーソルを維持し、自動再試行せず同じ位置から再試行する', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1], 'next')).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([2]));
    const list = createList({ getArticlePage });
    await list.refresh();
    await list.loadMore();
    expect(list.articles.value.map((item) => item.articleId)).toEqual([1]);
    expect(list.nextCursor.value).toBe('next');
    expect(list.error.value?.mode).toBe('append');
    await list.loadMore();
    expect(getArticlePage).toHaveBeenCalledTimes(2);
    await list.retry();
    expect(getArticlePage.mock.calls[2]?.[0]).toEqual({ kind: 'all', limit: 20, cursor: 'next' });
    expect(list.articles.value.map((item) => item.articleId)).toEqual([2, 1]);
    expect(list.error.value).toBeNull();
  });

  it('切り替え前の遅い応答は、新しい種類の一覧を上書きしない', async () => {
    const old = deferred<ArticlePageResponse>();
    const interested = page([7]);
    interested.articles[0]!.state.interested = true;
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockReturnValueOnce(old.promise).mockResolvedValueOnce(interested);
    const list = createList({ getArticlePage });
    const first = list.refresh();
    await list.changeKind('interested');
    expect(getArticlePage.mock.calls[0]?.[1]?.aborted).toBe(true);
    old.resolve(page([1], 'old'));
    await first;
    expect(list.kind.value).toBe('interested');
    expect(list.articles.value.map((item) => item.articleId)).toEqual([7]);
    expect(list.nextCursor.value).toBeNull();
  });

  it('追加取得中に更新したら、追加の古い応答を捨てる', async () => {
    const old = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1], 'first')).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page([9], 'latest'));
    const list = createList({ getArticlePage });
    await list.refresh();
    const append = list.loadMore();
    await list.refresh();
    old.resolve(page([2], 'stale'));
    await append;
    expect(list.articles.value.map((item) => item.articleId)).toEqual([9]);
    expect(list.nextCursor.value).toBe('latest');
  });

  it('更新失敗では元の一覧を残し、成功後に置き換える', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1], 'first')).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([9]));
    const list = createList({ getArticlePage });
    await list.refresh();
    await list.refresh();
    expect(list.articles.value.map((item) => item.articleId)).toEqual([1]);
    expect(list.nextCursor.value).toBe('first');
    expect(list.error.value?.mode).toBe('refresh');
    await list.retry();
    expect(list.articles.value.map((item) => item.articleId)).toEqual([9]);
  });

  it('連続切り替えの古い成功・失敗・完了で、最新の取得状態を変えない', async () => {
    const old = deferred<ArticlePageResponse>();
    const middle = deferred<ArticlePageResponse>();
    const latest = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(middle.promise).mockReturnValueOnce(latest.promise);
    const list = createList({ getArticlePage });
    const first = list.refresh();
    const second = list.changeKind('interested');
    const third = list.changeKind('all');
    old.resolve(page([1]));
    middle.reject(new Error('古い失敗'));
    await Promise.all([first, second]);
    expect(list.loading.value).toBe('initial');
    expect(list.error.value).toBeNull();
    latest.resolve(page([9]));
    await third;
    expect(list.articles.value.map((item) => item.articleId)).toEqual([9]);
  });

  it('初回失敗は再試行でき、空一覧も正常な終端になる', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([]));
    const list = createList({ getArticlePage });
    await list.refresh();
    expect(list.error.value?.mode).toBe('initial');
    await list.retry();
    expect(list.error.value).toBeNull();
    expect(list.articles.value).toEqual([]);
    expect(list.hasMore.value).toBe(false);
  });

  it('画面終了後は通信を中止し、遅い応答を反映しない', async () => {
    const pending = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>().mockReturnValue(pending.promise);
    const list = createList({ getArticlePage });
    const first = list.refresh();
    list.dispose();
    expect(getArticlePage.mock.calls[0]?.[1]?.aborted).toBe(true);
    pending.resolve(page([1]));
    await first;
    await list.refresh();
    expect(list.articles.value).toEqual([]);
    expect(getArticlePage).toHaveBeenCalledTimes(1);
  });

  it('起動時の未送信が解消してから初回取得し、通常保存では取り直さない', async () => {
    const state = useArticleChangeStore(createPinia());
    const getArticlePage = vi.fn().mockResolvedValue(page([1]));
    const list = useArticleListViewModel({ getArticlePage }, state, useArticleDataStore(createPinia()), {
      restoreAndSyncUnfinishedChanges: async () => {}, setArticleState: vi.fn(), retryUnfinishedChanges: vi.fn(), discardBlockedChanges: vi.fn(),
    });
    await list.initialize(); expect(getArticlePage).not.toHaveBeenCalled();
    state.updateSyncStatus({ startupSyncComplete: true }); await nextTick();
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    state.updateSyncStatus({ notice: '保存完了' }); await nextTick();
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    list.dispose();
  });

  it('起動同期を待っている間に画面を閉じた場合は後から取得しない', async () => {
    const state = useArticleChangeStore(createPinia()); const getArticlePage = vi.fn();
    const list = useArticleListViewModel({ getArticlePage }, state, useArticleDataStore(createPinia()), {
      restoreAndSyncUnfinishedChanges: async () => {}, setArticleState: vi.fn(), retryUnfinishedChanges: vi.fn(), discardBlockedChanges: vi.fn(),
    });
    await list.initialize(); list.dispose();
    state.updateSyncStatus({ startupSyncComplete: true }); await nextTick();
    expect(getArticlePage).not.toHaveBeenCalled();
  });
  it('座標をModelへ渡し、成立時だけ更新して表示用の距離を戻す', async () => {
    const getArticlePage = vi.fn().mockResolvedValue(page([1]));
    const list = createList({ getArticlePage });
    const touch = { x: 20, y: 20, atTop: true, touchCount: 1, onControl: false };
    list.beginPull(touch);
    list.movePull({ ...touch, y: 100 });
    expect(list.pullDistance.value).toBe(36);
    expect(list.pullReady.value).toBe(false);
    await list.finishPull();
    expect(getArticlePage).not.toHaveBeenCalled();
    list.beginPull(touch);
    expect(list.movePull({ ...touch, y: 200 })).toBe(true);
    expect(list.pullReady.value).toBe(true);
    await list.finishPull();
    await list.finishPull();
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    expect(list.pullDistance.value).toBe(0);
  });

  it('取得中・起動待機・画面終了後はジェスチャーから更新しない', async () => {
    const pending = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn().mockReturnValue(pending.promise);
    const list = createList({ getArticlePage });
    const touch = { x: 0, y: 0, atTop: true, touchCount: 1, onControl: false };
    const first = list.refresh();
    list.beginPull(touch);
    list.movePull({ ...touch, y: 200 });
    await list.finishPull();
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    pending.resolve(page([1])); await first;
    list.beginPull(touch); list.movePull({ ...touch, y: 200 });
    list.dispose();
    expect(list.pullDistance.value).toBe(0);
    list.beginPull(touch); list.movePull({ ...touch, y: 200 });
    expect(list.pullDistance.value).toBe(0);
    await list.finishPull();
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    const state = useArticleChangeStore(createPinia());
    const waitingApi = { getArticlePage: vi.fn() };
    const waiting = useArticleListViewModel(waitingApi, state, useArticleDataStore(createPinia()), {
      restoreAndSyncUnfinishedChanges: async () => {}, setArticleState: vi.fn(), retryUnfinishedChanges: vi.fn(), discardBlockedChanges: vi.fn(),
    });
    waiting.beginPull(touch); waiting.movePull({ ...touch, y: 200 }); await waiting.finishPull();
    expect(waitingApi.getArticlePage).not.toHaveBeenCalled();
  });

  it('タブ切り替えとタッチ中止では途中の操作を破棄する', async () => {
    const getArticlePage = vi.fn().mockResolvedValue(page([]));
    const list = createList({ getArticlePage });
    const touch = { x: 0, y: 0, atTop: true, touchCount: 1, onControl: false };
    list.beginPull(touch); list.movePull({ ...touch, y: 200 }); list.cancelPull();
    await list.finishPull(); expect(getArticlePage).not.toHaveBeenCalled();
    list.beginPull(touch); list.movePull({ ...touch, y: 200 });
    await list.changeKind('interested');
    expect(list.pullDistance.value).toBe(0);
    await list.finishPull(); expect(getArticlePage).toHaveBeenCalledTimes(1);
  });

});

function createList(api: ArticleListApi) {
  const state = useArticleChangeStore(createPinia());
  state.updateSyncStatus({ startupSyncComplete: true, storageRestored: true });
  return useArticleListViewModel(api, state, useArticleDataStore(createPinia()), { restoreAndSyncUnfinishedChanges: async () => {}, setArticleState: vi.fn(), retryUnfinishedChanges: vi.fn(), discardBlockedChanges: vi.fn() });
}
