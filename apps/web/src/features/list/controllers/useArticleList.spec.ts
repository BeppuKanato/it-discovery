import { describe, expect, it, vi } from 'vitest';
import type { ArticlePageResponse } from '@it-discovery/contracts';
import type { ArticleListApi } from '../models/article-list-api';
import { page } from '../../../test/article-fixture';
import { useArticleList } from './useArticleList';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('記事一覧の取得と競合', () => {
  it('全記事を先頭20件から要求し、記事と続き位置を表示する', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>().mockResolvedValue(page([1, 2], 'next'));
    const list = useArticleList({ getArticlePage });
    await list.refresh();
    expect(getArticlePage).toHaveBeenCalledWith({ kind: 'all', limit: 20 }, expect.any(AbortSignal));
    expect(list.articles.value.map((item) => item.articleId)).toEqual([1, 2]);
    expect(list.nextCursor.value).toBe('next');
    expect(list.canLoadMore.value).toBe(true);
  });

  it('追加中の重複要求と終端の要求を止め、記事IDで重複を除く', async () => {
    const pending = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1, 2], 'next')).mockReturnValueOnce(pending.promise);
    const list = useArticleList({ getArticlePage });
    await list.refresh();
    const append = list.loadMore();
    await list.loadMore();
    expect(getArticlePage).toHaveBeenCalledTimes(2);
    pending.resolve(page([2, 3]));
    await append;
    await list.loadMore();
    expect(list.articles.value.map((item) => item.articleId)).toEqual([1, 2, 3]);
    expect(getArticlePage).toHaveBeenCalledTimes(2);
    expect(list.hasMore.value).toBe(false);
  });

  it('追加失敗で記事とカーソルを維持し、自動再試行せず同じ位置から再試行する', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1], 'next')).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([2]));
    const list = useArticleList({ getArticlePage });
    await list.refresh();
    await list.loadMore();
    expect(list.articles.value.map((item) => item.articleId)).toEqual([1]);
    expect(list.nextCursor.value).toBe('next');
    expect(list.error.value?.mode).toBe('append');
    await list.loadMore();
    expect(getArticlePage).toHaveBeenCalledTimes(2);
    await list.retry();
    expect(getArticlePage.mock.calls[2]?.[0]).toEqual({ kind: 'all', limit: 20, cursor: 'next' });
    expect(list.articles.value.map((item) => item.articleId)).toEqual([1, 2]);
    expect(list.error.value).toBeNull();
  });

  it('切り替え前の遅い応答は、新しい種類の一覧を上書きしない', async () => {
    const old = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockReturnValueOnce(old.promise).mockResolvedValueOnce(page([7]));
    const list = useArticleList({ getArticlePage });
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
    const list = useArticleList({ getArticlePage });
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
    const list = useArticleList({ getArticlePage });
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
    const list = useArticleList({ getArticlePage });
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
    const list = useArticleList({ getArticlePage });
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
    const list = useArticleList({ getArticlePage });
    const first = list.refresh();
    list.dispose();
    expect(getArticlePage.mock.calls[0]?.[1]?.aborted).toBe(true);
    pending.resolve(page([1]));
    await first;
    await list.refresh();
    expect(list.articles.value).toEqual([]);
    expect(getArticlePage).toHaveBeenCalledTimes(1);
  });
});
