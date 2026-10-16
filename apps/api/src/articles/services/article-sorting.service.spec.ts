import { randomUUID } from 'node:crypto';
import type { StoredArticle } from '../repositories/article.repository';
import { ArticleRepository } from '../repositories/article.repository';
import { ArticleInterestBatchRepository } from '../repositories/article-interest-batch.repository';
import type { StoredInterestBatch } from '../models/article-sorting';
import { ArticleSortingService } from './article-sorting.service';

describe('仕分け対象と一括登録の判断', () => {
  let articles: jest.Mocked<ArticleRepository>;
  let batches: jest.Mocked<ArticleInterestBatchRepository>;
  let service: ArticleSortingService;
  const makeArticle = (articleId: number): StoredArticle => ({
    article: { articleId, sourceId: 'zenn', url: `https://example.com/${articleId}`, title: '記事', fetchedAt: new Date() },
    state: { interested: false, pinned: true, lastOpenedAt: new Date('2026-10-16T00:00:00Z') },
  });
  beforeEach(() => {
    const records = new Map<string, StoredInterestBatch>();
    articles = {
      transaction: jest.fn((work: () => unknown) => work()) as jest.Mocked<ArticleRepository>['transaction'],
      findById: jest.fn((id: number): StoredArticle | undefined => makeArticle(id)),
      findByIdentity: jest.fn(), findPage: jest.fn(), findSortingCandidates: jest.fn().mockReturnValue([]),
      insert: jest.fn(), updateContent: jest.fn(),
      updateState: jest.fn((id, patch) => ({ ...makeArticle(id), state: { ...makeArticle(id).state, ...patch } })),
    };
    batches = {
      findById: jest.fn((id: string) => records.get(id)),
      insert: jest.fn((batch: StoredInterestBatch) => { records.set(batch.batchId, batch); }),
    };
    service = new ArticleSortingService(articles, batches);
  });

  it('最大10件をRepositoryへ要求し、対象なしでも状態変更しない', () => {
    expect(service.getCandidates()).toEqual([]);
    expect(articles.findSortingCandidates).toHaveBeenCalledWith(10);
    expect(articles.updateState).not.toHaveBeenCalled();
  });

  it('ID集合を正規化し、登録だけを変更して結果を保存する', () => {
    const batchId = randomUUID();
    const result = service.submit(batchId, { revision: 3, articleIds: [2, 1] });
    expect(result).toEqual({ batchId, revision: 3, results: [{ articleId: 1, status: 'saved' }, { articleId: 2, status: 'saved' }] });
    expect(articles.updateState.mock.calls).toEqual([[1, { interested: true }], [2, { interested: true }]]);
    expect(batches.insert).toHaveBeenCalledWith(expect.objectContaining({ batchId, requestKey: '[1,2]', result }));
  });

  it('同じ回・版・集合の再送は記事を読まず、前回の結果を返す', () => {
    const batchId = randomUUID();
    const result = service.submit(batchId, { revision: 1, articleIds: [2, 1] });
    articles.findById.mockClear(); articles.updateState.mockClear(); batches.insert.mockClear();
    expect(service.submit(batchId.toUpperCase(), { revision: 1, articleIds: [1, 2] })).toEqual(result);
    expect(articles.findById).not.toHaveBeenCalled();
    expect(articles.updateState).not.toHaveBeenCalled();
    expect(batches.insert).not.toHaveBeenCalled();
    expect(service.getBatch(batchId.toUpperCase())).toEqual(result);
  });

  it('受理した回の別版・別集合は競合とし、状態を更新しない', () => {
    const id = randomUUID();
    service.submit(id, { revision: 2, articleIds: [1] });
    articles.updateState.mockClear();
    for (const input of [{ revision: 1, articleIds: [1] }, { revision: 3, articleIds: [1] }, { revision: 2, articleIds: [2] }]) {
      expect(() => service.submit(id, input)).toThrow('すでに確定');
    }
    expect(articles.updateState).not.toHaveBeenCalled();
  });

  it('途中削除を記事別のmissingにし、登録済みの記事にも再書き込みしない', () => {
    const existing = makeArticle(1); existing.state.interested = true;
    articles.findById.mockImplementation((id) => id === 1 ? existing : undefined);
    expect(service.submit(randomUUID(), { revision: 1, articleIds: [1, 2] }).results)
      .toEqual([{ articleId: 1, status: 'saved' }, { articleId: 2, status: 'missing' }]);
    expect(articles.updateState).not.toHaveBeenCalled();
  });

  it('空集合も明示的に受け取った場合は結果を記録し、記事に触らない', () => {
    expect(service.submit(randomUUID(), { revision: 1, articleIds: [] }).results).toEqual([]);
    expect(articles.findById).not.toHaveBeenCalled();
    expect(batches.insert).toHaveBeenCalledTimes(1);
  });

  it('記事の更新で例外になったら、成功結果を記録せず例外を伝える', () => {
    articles.updateState.mockImplementation(() => { throw new Error('DB failure'); });
    expect(() => service.submit(randomUUID(), { revision: 1, articleIds: [1] })).toThrow('DB failure');
    expect(batches.insert).not.toHaveBeenCalled();
  });

  it.each([
    null, [], {}, { revision: 1 }, { revision: '1', articleIds: [] }, { revision: 0, articleIds: [] },
    { revision: 1.5, articleIds: [] }, { revision: Number.MAX_SAFE_INTEGER + 1, articleIds: [] },
    { revision: 1, articleIds: null }, { revision: 1, articleIds: [0] }, { revision: 1, articleIds: [-1] },
    { revision: 1, articleIds: ['1'] }, { revision: 1, articleIds: [1, 1] },
    { revision: 1, articleIds: [1.5] }, { revision: 1, articleIds: [Number.MAX_SAFE_INTEGER + 1] },
    { revision: 1, articleIds: Array(1) }, { revision: 1, articleIds: Array.from({ length: 11 }, (_, i) => i + 1) },
    { revision: 1, articleIds: [], history: [] },
  ])('不正な最終結果はトランザクション開始前に拒否する: %j', (input) => {
    expect(() => service.submit(randomUUID(), input)).toThrow();
    expect(articles.transaction).not.toHaveBeenCalled();
  });

  it('不正な回IDを拒否し、未記録の回は未記録のまま返す', () => {
    expect(() => service.submit('bad', { revision: 1, articleIds: [] })).toThrow();
    expect(() => service.getBatch('bad')).toThrow();
    expect(service.getBatch(randomUUID())).toBeUndefined();
    expect(articles.transaction).not.toHaveBeenCalled();
  });
});
