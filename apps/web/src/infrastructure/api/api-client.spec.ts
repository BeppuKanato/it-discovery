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

describe('記事の状態変更と結果照会', () => {
  const request = { operationId: '67b24717-8bac-4cc3-a836-fb3174ff4e23', change: { kind: 'interested' as const, value: true } };
  const response = { operationId: request.operationId, articleId: 1, status: 'saved', state: article(1).state };
  beforeEach(() => { get.mockReset(); put.mockReset(); create.mockReturnValue({ get, put }); });

  it('同じ操作IDと値をPUTへ渡し、対応する応答を返す', async () => {
    put.mockResolvedValue({ data: response });
    const signal = new AbortController().signal;
    expect(await new ApiClient('/api').applyArticleState(1, request, signal)).toEqual(response);
    expect(put).toHaveBeenCalledWith('/articles/1/state', request, { signal });
  });

  it.each([400, 401, 409, 429, 500])('HTTP %iを再試行可否で区別する', async (status) => {
    put.mockRejectedValue({ response: { status } });
    await expect(new ApiClient('/api').applyArticleState(1, request)).rejects.toMatchObject({
      kind: status === 400 ? 'invalid' : [401, 409].includes(status) ? 'blocked' : 'temporary',
    });
  });

  it('別記事・別操作・壊れた応答を成功として渡さない', async () => {
    for (const data of [{ ...response, articleId: 2 }, { ...response, operationId: 'other' }, { ...response, state: {} }]) {
      put.mockResolvedValue({ data });
      await expect(new ApiClient('/api').applyArticleState(1, request)).rejects.toMatchObject({ kind: 'temporary' });
    }
  });

  it('結果未記録の404だけundefinedにし、照会400を保存拒否とみなさない', async () => {
    get.mockRejectedValueOnce({ response: { status: 404 } }).mockRejectedValueOnce({ response: { status: 400 } });
    const api = new ApiClient('/api');
    expect(await api.getArticleStateOperation(request.operationId)).toBeUndefined();
    await expect(api.getArticleStateOperation(request.operationId)).rejects.toMatchObject({ kind: 'blocked' });
  });

  it('削除済みの結果と結果照会の保存済み応答を受け取る', async () => {
    put.mockResolvedValue({ data: { ...response, status: 'missing', state: null } });
    get.mockResolvedValue({ data: response });
    const api = new ApiClient('/api');
    expect((await api.applyArticleState(1, request)).status).toBe('missing');
    expect(await api.getArticleStateOperation(request.operationId)).toEqual(response);
    expect(get).toHaveBeenCalledWith(`/article-state-operations/${request.operationId}`, { signal: undefined });
  });
});
