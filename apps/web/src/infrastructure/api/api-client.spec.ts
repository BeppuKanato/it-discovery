import { beforeEach, describe, expect, it, vi } from 'vitest';
import { article, page } from '../../test/article-fixture';
import { ApiClient } from './api-client';

const { get, put, create } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), create: vi.fn() }));
vi.mock('axios', () => ({ default: { create, isAxiosError: (value: unknown) => !!value && typeof value === 'object' && 'response' in value } }));

describe('一覧のAPI通信', () => {
  beforeEach(() => { get.mockReset(); put.mockReset(); create.mockReturnValue({ get, put }); });

  it('Axiosへ取得条件と中止シグナルを渡す', async () => {
    const result = page([1]);
    get.mockResolvedValue({ data: result });
    const signal = new AbortController().signal;
    expect(await new ApiClient('/api').getArticlePage({ kind: 'all', limit: 20 }, signal)).toEqual(result);
    expect(get).toHaveBeenCalledWith('/articles', { params: { kind: 'all', limit: 20 }, signal });
  });

  it.each([
    { articles: null, hasMore: false, nextCursor: null },
    { articles: [article(1)], hasMore: true, nextCursor: null },
    { articles: [], hasMore: true, nextCursor: 'next' },
    { articles: [{ ...article(1), fetchedAt: 'invalid' }], hasMore: false, nextCursor: null },
    { articles: [{ ...article(1), state: {} }], hasMore: false, nextCursor: null },
  ])('不正な応答を表示データとして渡さない', async (data) => {
    get.mockResolvedValue({ data });
    await expect(new ApiClient('/api').getArticlePage({ kind: 'all' })).rejects.toThrow('一覧の応答');
  });

  it('進まないカーソルを拒否して追加取得の繰り返しを防ぐ', async () => {
    get.mockResolvedValue({ data: page([1], 'same') });
    await expect(new ApiClient('/api').getArticlePage({ cursor: 'same' })).rejects.toThrow();
  });
});

describe('記事の状態保存と現在状態の取得', () => {
  const request = { change: { kind: 'interested' as const, value: true } };
  const response = { articleId: 1, state: article(1).state };
  beforeEach(() => { get.mockReset(); put.mockReset(); create.mockReturnValue({ get, put }); });
  it('操作IDなしのPUTとGETを中止シグナル付きで送る', async () => {
    put.mockResolvedValue({ data: response }); get.mockResolvedValue({ data: response });
    const api = new ApiClient('/api'); const signal = new AbortController().signal;
    expect(await api.updateArticleState(1, request, signal)).toEqual(response);
    expect(put).toHaveBeenCalledWith('/articles/1/state', request, { signal });
    expect(await api.getArticleState(1, signal)).toEqual(response);
    expect(get).toHaveBeenCalledWith('/articles/1/state', { signal });
  });
  it.each([400, 401, 404, 409, 429, 500])('HTTP %iを失わずModelへ渡す', async status => {
    put.mockRejectedValue({ response: { status } });
    await expect(new ApiClient('/api').updateArticleState(1, request)).rejects.toMatchObject({ status });
    expect(put).toHaveBeenCalledTimes(1);
  });
  it.each([{ ...response, articleId: 2 }, { ...response, state: {} }, { ...response, state: { ...response.state, lastOpenedAt: 'invalid' } }])('不正な応答を保存成功にしない', async data => {
    put.mockResolvedValue({ data }); get.mockResolvedValue({ data });
    const api = new ApiClient('/api');
    await expect(api.updateArticleState(1, request)).rejects.toMatchObject({ status: undefined });
    await expect(api.getArticleState(1)).rejects.toThrow();
  });
});
