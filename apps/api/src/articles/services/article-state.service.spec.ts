import type { StoredArticle } from '../repositories/article.repository';
import { ArticleRepository } from '../repositories/article.repository';
import { ArticleStateService } from './article-state.service';

// SQLiteに依存せず、判断と呼び出し順だけを仮のRepositoryで確認する。
describe('記事状態の直接保存', () => {
  let articles: jest.Mocked<ArticleRepository>;
  let service: ArticleStateService;
  let current: StoredArticle;
  beforeEach(() => {
    current = {
      article: { articleId: 1, sourceId: 'zenn', url: 'https://example.com', title: '記事', fetchedAt: new Date() },
      state: { interested: false, pinned: true, lastOpenedAt: null },
    };
    articles = {
      transaction: jest.fn((action: () => unknown) => action()) as jest.Mocked<ArticleRepository>['transaction'],
      findById: jest.fn((_id: number): StoredArticle | undefined => current), findByIdentity: jest.fn(), findByIds: jest.fn(), registerInterests: jest.fn(), findSortingCandidates: jest.fn(), findPage: jest.fn(),
      insert: jest.fn(), updateContent: jest.fn(),
      updateState: jest.fn((_id, patch) => ({ ...current, state: { ...current.state, ...patch } })),
    };
    service = new ArticleStateService(articles);
  });

  it('指定した項目だけを変更し、更新後の状態を返す', () => {
    const result = service.apply(1, { change: { kind: 'interested', value: true } });
    expect(articles.updateState).toHaveBeenCalledWith(1, { interested: true });
    expect(result).toEqual({ interested: true, pinned: true, lastOpenedAt: null });
  });

  it('既読日時は新しい場合だけ更新し、他の状態を変更しない', () => {
    current.state.lastOpenedAt = new Date('2026-10-15T12:00:00.000Z');
    for (const openedAt of ['2026-10-14T12:00:00.000Z', '2026-10-15T12:00:00.000Z']) {
      expect(service.apply(1, { change: { kind: 'opened', openedAt } })).toEqual(current.state);
      expect(articles.updateState).not.toHaveBeenCalled();
    }
    service.apply(1, { change: { kind: 'opened', openedAt: '2026-10-16T12:00:00.000Z' } });
    expect(articles.updateState).toHaveBeenCalledWith(1, { lastOpenedAt: new Date('2026-10-16T12:00:00.000Z') });
  });

  it('記事がなければ更新しない', () => {
    articles.findById.mockReturnValue(undefined);
    expect(service.apply(1, { change: { kind: 'pinned', value: true } })).toBeUndefined();
    expect(articles.updateState).not.toHaveBeenCalled();
  });

  it('存在確認後の保存失敗を成功として返さない', () => {
    articles.updateState.mockReturnValue(undefined);
    expect(() => service.apply(1, { change: { kind: 'pinned', value: true } })).toThrow();
  });

  it.each([
    null, [], {},
    { operationId: 'legacy', change: { kind: 'pinned', value: true } },
    ...[
      { kind: 'pinned', value: 'true' }, { kind: 'interested', value: null },
      { kind: 'opened', openedAt: null }, { kind: 'opened', openedAt: '2026-02-30T00:00:00.000Z' },
      { kind: 'opened', openedAt: '2026-10-16' }, { kind: 'opened', openedAt: '2026-10-16T00:00:00.000+00:00' },
      { kind: 'opened', openedAt: '2026-10-16T00:00:00.000Z', value: true },
      { kind: 'toggle' }, { kind: 'unread' }, { kind: 'pinned', value: true, extra: 1 },
    ].map((change) => ({ change })),
    { change: { kind: 'pinned', value: true }, extra: 1 },
  ])('不正な入力は保存処理の前に拒否する: %j', (input) => {
    expect(() => service.apply(1, input)).toThrow();
    expect(articles.transaction).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])('記事ID %s を拒否する', (id) => {
    expect(() => service.getState(id)).toThrow();
    expect(() => service.apply(id, {})).toThrow();
    expect(articles.transaction).not.toHaveBeenCalled();
  });

  it('現在の確定状態を返す', () => {
    expect(service.getState(1)).toEqual(current.state);
  });
});
