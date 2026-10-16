import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import type { ArticlePageResponse } from '@it-discovery/contracts';
import type { ArticleListApi } from './article-list-api';
import { useArticleDataStore } from '../../articles/models/article-data.store';
import { useArticleChangeStore } from '../../article-changes/models/article-change.store';
import { page } from '../../../test/article-fixture';
import { createArticleListModel } from './article-list.model';
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('一覧Modelの取得・ページ管理・古い応答の破棄', () => {
  it('全記事を先頭20件から要求し、記事と続き位置を表示する', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>().mockResolvedValue(page([1, 2], 'next'));
    const list = createList({ getArticlePage });
    await list.refreshArticles();
    expect(getArticlePage).toHaveBeenCalledWith({ kind: 'all', limit: 20 }, expect.any(AbortSignal));
    expect(list.displayedArticles.value.map((item) => item.articleId)).toEqual([2, 1]);
    expect(list.nextCursor.value).toBe('next');
    expect(list.canLoadMore.value).toBe(true);
  });

  it('追加中の重複要求と終端の要求を止め、記事IDで重複を除く', async () => {
    const pending = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1, 2], 'next')).mockReturnValueOnce(pending.promise);
    const list = createList({ getArticlePage });
    await list.refreshArticles();
    const append = list.loadMoreArticles();
    await list.loadMoreArticles();
    expect(getArticlePage).toHaveBeenCalledTimes(2);
    pending.resolve(page([2, 3]));
    await append;
    await list.loadMoreArticles();
    expect(list.displayedArticles.value.map((item) => item.articleId)).toEqual([3, 2, 1]);
    expect(getArticlePage).toHaveBeenCalledTimes(2);
    expect(list.hasMore.value).toBe(false);
  });

  it('追加失敗で記事とカーソルを維持し、自動再試行せず同じ位置から再試行する', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1], 'next')).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([2]));
    const list = createList({ getArticlePage });
    await list.refreshArticles();
    await list.loadMoreArticles();
    expect(list.displayedArticles.value.map((item) => item.articleId)).toEqual([1]);
    expect(list.nextCursor.value).toBe('next');
    expect(list.listError.value?.mode).toBe('append');
    await list.loadMoreArticles();
    expect(getArticlePage).toHaveBeenCalledTimes(2);
    await list.retryArticleLoad();
    expect(getArticlePage.mock.calls[2]?.[0]).toEqual({ kind: 'all', limit: 20, cursor: 'next' });
    expect(list.displayedArticles.value.map((item) => item.articleId)).toEqual([2, 1]);
    expect(list.listError.value).toBeNull();
  });

  it('切り替え前の遅い応答は、新しい種類の一覧を上書きしない', async () => {
    const old = deferred<ArticlePageResponse>();
    const interested = page([7]);
    interested.articles[0]!.state.interested = true;
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockReturnValueOnce(old.promise).mockResolvedValueOnce(interested);
    const list = createList({ getArticlePage });
    const first = list.refreshArticles();
    await list.changeListKind('interested');
    expect(getArticlePage.mock.calls[0]?.[1]?.aborted).toBe(true);
    old.resolve(page([1], 'old'));
    await first;
    expect(list.selectedKind.value).toBe('interested');
    expect(list.displayedArticles.value.map((item) => item.articleId)).toEqual([7]);
    expect(list.nextCursor.value).toBeNull();
  });

  it('追加取得中に更新したら、追加の古い応答を捨てる', async () => {
    const old = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1], 'first')).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page([9], 'latest'));
    const list = createList({ getArticlePage });
    await list.refreshArticles();
    const append = list.loadMoreArticles();
    await list.refreshArticles();
    old.resolve(page([2], 'stale'));
    await append;
    expect(list.displayedArticles.value.map((item) => item.articleId)).toEqual([9]);
    expect(list.nextCursor.value).toBe('latest');
  });

  it('更新失敗では元の一覧を残し、成功後に置き換える', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockResolvedValueOnce(page([1], 'first')).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([9]));
    const list = createList({ getArticlePage });
    await list.refreshArticles();
    await list.refreshArticles();
    expect(list.displayedArticles.value.map((item) => item.articleId)).toEqual([1]);
    expect(list.nextCursor.value).toBe('first');
    expect(list.listError.value?.mode).toBe('refresh');
    await list.retryArticleLoad();
    expect(list.displayedArticles.value.map((item) => item.articleId)).toEqual([9]);
  });

  it('連続切り替えの古い成功・失敗・完了で、最新の取得状態を変えない', async () => {
    const old = deferred<ArticlePageResponse>();
    const middle = deferred<ArticlePageResponse>();
    const latest = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(middle.promise).mockReturnValueOnce(latest.promise);
    const list = createList({ getArticlePage });
    const first = list.refreshArticles();
    const second = list.changeListKind('interested');
    const third = list.changeListKind('all');
    old.resolve(page([1]));
    middle.reject(new Error('古い失敗'));
    await Promise.all([first, second]);
    expect(list.listLoading.value).toBe('initial');
    expect(list.listError.value).toBeNull();
    latest.resolve(page([9]));
    await third;
    expect(list.displayedArticles.value.map((item) => item.articleId)).toEqual([9]);
  });

  it('初回失敗は再試行でき、空一覧も正常な終端になる', async () => {
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>()
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([]));
    const list = createList({ getArticlePage });
    await list.refreshArticles();
    expect(list.listError.value?.mode).toBe('initial');
    await list.retryArticleLoad();
    expect(list.listError.value).toBeNull();
    expect(list.displayedArticles.value).toEqual([]);
    expect(list.hasMore.value).toBe(false);
  });

  it('画面終了後は通信を中止し、遅い応答を反映しない', async () => {
    const pending = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn<ArticleListApi['getArticlePage']>().mockReturnValue(pending.promise);
    const list = createList({ getArticlePage });
    const first = list.refreshArticles();
    list.dispose();
    expect(getArticlePage.mock.calls[0]?.[1]?.aborted).toBe(true);
    pending.resolve(page([1]));
    await first;
    await list.refreshArticles();
    expect(list.displayedArticles.value).toEqual([]);
    expect(getArticlePage).toHaveBeenCalledTimes(1);
  });

});
function createList(api: ArticleListApi) {
  const pinia = createPinia(); const changes = useArticleChangeStore(pinia);
  changes.updateSyncStatus({ startupSyncComplete: true, storageRestored: true });
  return createArticleListModel(api, useArticleDataStore(pinia), changes);
}
