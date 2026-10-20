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

describe('仕分け対象のAPI通信', () => {
  beforeEach(() => { get.mockReset(); put.mockReset(); create.mockReturnValue({ get, put }); });
  it('条件やページングを足さず、中止シグナル付きで対象を取得する', async () => {
    const response = { articles: [article(2), article(1)] }; const signal = new AbortController().signal;
    get.mockResolvedValue({ data: response }); expect(await new ApiClient('/api').getSortingCandidates(signal)).toEqual(response);
    expect(get).toHaveBeenCalledExactlyOnceWith('/sorting/candidates', { signal }); expect(put).not.toHaveBeenCalled();
  });
  it('0件を正常応答として返す', async () => {
    get.mockResolvedValue({ data: { articles: [] } }); expect(await new ApiClient('/api').getSortingCandidates()).toEqual({ articles: [] });
  });
  it.each([
    { articles: null }, { articles: Array.from({ length: 11 }, (_, i) => article(i + 1)) },
    { articles: [article(1), article(1)] }, { articles: [{ ...article(1), state: {} }] },
    { articles: [{ ...article(1), state: { ...article(1).state, interested: true } }] },
    { articles: [{ ...article(1), state: { ...article(1).state, pinned: true } }] },
    { articles: [{ ...article(1), state: { ...article(1).state, lastOpenedAt: '2026-10-20T00:00:00.000Z' } }] },
  ])('不正・対象条件外の応答は仕分けを開始させない', async data => {
    get.mockResolvedValue({ data }); await expect(new ApiClient('/api').getSortingCandidates()).rejects.toThrow('仕分け対象');
  });
});

describe('仕分け一括登録の通信',()=>{
  const batch={batchId:'00000000-0000-4000-8000-000000000001',revision:2,articleIds:[1,2]};
  const result={batchId:batch.batchId,revision:2,results:[{articleId:1,status:'saved'},{articleId:2,status:'missing'}]};
  beforeEach(()=>{get.mockReset();put.mockReset();create.mockReturnValue({get,put});});
  it('結果照会の404だけ未記録とし、同じ回ID・版・集合をPUTする',async()=>{
    const api=new ApiClient('/api');get.mockRejectedValueOnce({response:{status:404}});expect(await api.getInterestBatchResult(batch)).toBeUndefined();
    put.mockResolvedValueOnce({data:result});expect(await api.saveInterestBatch(batch)).toEqual(result);expect(put).toHaveBeenCalledWith(`/sorting/interest-batches/${batch.batchId}`,{revision:2,articleIds:[1,2]},{signal:undefined});
  });
  it.each([400,401,403,404,409,422])('PUT %iでは自動再送を止める',async status=>{put.mockRejectedValueOnce({response:{status}});await expect(new ApiClient('/api').saveInterestBatch(batch)).rejects.toMatchObject({kind:'blocked'});});
  it.each([429,500])('PUT %iは記録を残して再試行する',async status=>{put.mockRejectedValueOnce({response:{status}});await expect(new ApiClient('/api').saveInterestBatch(batch)).rejects.toMatchObject({kind:'temporary'});});
  it.each([{...result,revision:3},{...result,batchId:'other'},{...result,results:[{articleId:1,status:'saved'},{articleId:1,status:'saved'}]},{...result,results:[{articleId:3,status:'saved'}]}])('識別・版・ID集合の異なる応答で成功扱いしない',async data=>{put.mockResolvedValueOnce({data});await expect(new ApiClient('/api').saveInterestBatch(batch)).rejects.toMatchObject({kind:'blocked'});});
});
