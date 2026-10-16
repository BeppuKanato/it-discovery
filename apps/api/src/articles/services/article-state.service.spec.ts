import { randomUUID } from 'node:crypto';
import type { StoredArticle } from '../repositories/article.repository';
import { ArticleRepository } from '../repositories/article.repository';
import { ArticleStateOperationRepository } from '../repositories/article-state-operation.repository';
import { ArticleStateService } from './article-state.service';

// SQLiteに依存せず、判断と呼び出し順だけを仮のRepositoryで確認する。
describe('記事状態の変更と再送の判断', () => {
  let articles: jest.Mocked<ArticleRepository>;
  let operations: jest.Mocked<ArticleStateOperationRepository>;
  let service: ArticleStateService;
  let current: StoredArticle;
  beforeEach(() => {
    current = {
      article: { articleId: 1, sourceId: 'zenn', url: 'https://example.com', title: '記事', fetchedAt: new Date() },
      state: { interested: false, pinned: true, lastOpenedAt: null },
    };
    articles = {
      transaction: jest.fn((action: () => unknown) => action()) as jest.Mocked<ArticleRepository>['transaction'],
      findById: jest.fn((_id: number): StoredArticle | undefined => current), findByIdentity: jest.fn(), findPage: jest.fn(),
      insert: jest.fn(), updateContent: jest.fn(),
      updateState: jest.fn((_id, patch) => ({ ...current, state: { ...current.state, ...patch } })),
    };
    operations = { findById: jest.fn(), insert: jest.fn() };
    service = new ArticleStateService(articles, operations);
  });

  it('明示した項目だけを変更し、状態変更後に結果を記録する', () => {
    const operationId = randomUUID();
    const result = service.apply(1, { operationId, change: { kind: 'interested', value: true } });
    expect(articles.updateState).toHaveBeenCalledWith(1, { interested: true });
    expect(result).toMatchObject({ operationId, status: 'saved', state: { interested: true, pinned: true, lastOpenedAt: null } });
    expect(operations.insert).toHaveBeenCalledWith(expect.objectContaining({ result }));
    expect(articles.updateState.mock.invocationCallOrder[0]).toBeLessThan(operations.insert.mock.invocationCallOrder[0]!);
  });

  it('同じ内容の再送は前回結果を返し、記事の検索も変更もしない', () => {
    const operationId = randomUUID();
    const input = { operationId, change: { kind: 'interested', value: true } };
    service.apply(1, input);
    const record = operations.insert.mock.calls[0]![0];
    operations.findById.mockReturnValue(record);
    articles.findById.mockClear(); articles.updateState.mockClear(); operations.insert.mockClear();
    expect(service.apply(1, { ...input, operationId: operationId.toUpperCase() })).toEqual(record.result);
    expect(articles.findById).not.toHaveBeenCalled();
    expect(articles.updateState).not.toHaveBeenCalled();
    expect(operations.insert).not.toHaveBeenCalled();
  });

  it('同じIDで値または対象記事が異なる要求を拒否する', () => {
    const operationId = randomUUID();
    service.apply(1, { operationId, change: { kind: 'pinned', value: false } });
    operations.findById.mockReturnValue(operations.insert.mock.calls[0]![0]);
    for (const [id, value] of [[1, true], [2, false]] as const) {
      expect(() => service.apply(id, { operationId, change: { kind: 'pinned', value } }))
        .toThrow('同じ操作ID');
    }
  });

  it('既読日時は新しい場合だけ更新し、他の状態を変更しない', () => {
    current.state.lastOpenedAt = new Date('2026-10-15T12:00:00.000Z');
    for (const openedAt of ['2026-10-14T12:00:00.000Z', '2026-10-15T12:00:00.000Z']) {
      service.apply(1, { operationId: randomUUID(), change: { kind: 'opened', openedAt } });
      expect(articles.updateState).toHaveBeenLastCalledWith(1, {});
    }
    service.apply(1, { operationId: randomUUID(), change: { kind: 'opened', openedAt: '2026-10-16T12:00:00.000Z' } });
    expect(articles.updateState).toHaveBeenLastCalledWith(1, { lastOpenedAt: new Date('2026-10-16T12:00:00.000Z') });
  });

  it('削除済みを確定結果として記録する', () => {
    articles.findById.mockReturnValue(undefined);
    const result = service.apply(1, { operationId: randomUUID(), change: { kind: 'pinned', value: true } });
    expect(result).toMatchObject({ status: 'missing', state: null });
    expect(articles.updateState).not.toHaveBeenCalled();
    expect(operations.insert).toHaveBeenCalledWith(expect.objectContaining({ result }));
  });

  it.each([
    null, [], {}, { change: { kind: 'pinned', value: true } },
    { operationId: 'invalid', change: { kind: 'pinned', value: true } },
    ...[
      { kind: 'pinned', value: 'true' }, { kind: 'interested', value: null },
      { kind: 'opened', openedAt: null }, { kind: 'opened', openedAt: '2026-02-30T00:00:00.000Z' },
      { kind: 'opened', openedAt: '2026-10-16' }, { kind: 'opened', openedAt: '2026-10-16T00:00:00.000+00:00' },
      { kind: 'opened', openedAt: '2026-10-16T00:00:00.000Z', value: true },
      { kind: 'toggle' }, { kind: 'unread' }, { kind: 'pinned', value: true, extra: 1 },
    ].map((change) => ({ operationId: randomUUID(), change })),
    { operationId: randomUUID(), change: { kind: 'pinned', value: true }, extra: 1 },
  ])('不正な入力は保存処理の前に拒否する: %j', (input) => {
    expect(() => service.apply(1, input)).toThrow();
    expect(articles.transaction).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])('記事ID %s を拒否する', (id) => {
    expect(() => service.getState(id)).toThrow();
    expect(() => service.apply(id, {})).toThrow();
    expect(articles.transaction).not.toHaveBeenCalled();
  });

  it('結果未記録を未記録のまま返し、不正な照会IDは拒否する', () => {
    expect(service.getOperation(randomUUID())).toBeUndefined();
    expect(() => service.getOperation('bad')).toThrow();
    expect(service.getState(1)).toEqual(current.state);
  });
});

