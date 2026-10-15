import { beforeEach, describe, expect, it, vi } from 'vitest';
import { article, page } from '../../test/article-fixture';
import { ApiClient } from './api-client';

const { get, create } = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn() }));
vi.mock('axios', () => ({ default: { create } }));

describe('一覧のAPI通信', () => {
  beforeEach(() => { get.mockReset(); create.mockReturnValue({ get }); });

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
