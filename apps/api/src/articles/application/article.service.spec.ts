import type { ArticleIdentity } from '../models/article';
import { ArticleRepository, type StoredArticle } from './article.repository';
import { ArticleService } from './article.service';

describe('記事の登録・更新の判断', () => {
  const input = { sourceId: 'zenn', externalArticleId: 'article-1', url: 'https://example.com/1', title: 'タイトル' };
  const fetchedAt = new Date('2026-10-01T00:00:00Z');
  const saved: StoredArticle = {
    article: { ...input, articleId: 1, fetchedAt },
    state: { interested: false, pinned: false, lastOpenedAt: null },
  };
  let repository: jest.Mocked<ArticleRepository>;
  let service: ArticleService;

  beforeEach(() => {
    repository = {
      transaction: jest.fn((operation: () => unknown) => operation()) as jest.Mocked<ArticleRepository>['transaction'],
      findByIdentity: jest.fn(),
      findById: jest.fn(),
      insert: jest.fn().mockReturnValue(saved),
      updateContent: jest.fn().mockReturnValue(saved),
      updateState: jest.fn(),
    };
    service = new ArticleService(repository);
  });

  it('不正な記事はDBへの検索・保存前に拒否する', () => {
    for (const invalid of [{ ...input, title: ' ' }, { ...input, url: '' }, { ...input, sourceId: ' ' }]) {
      expect(() => service.register(invalid)).toThrow();
    }
    expect(() => service.register(input, new Date('invalid'))).toThrow();
    expect(() => service.register({ ...input, publishedAt: new Date('invalid') })).toThrow();
    expect(repository.transaction).not.toHaveBeenCalled();
    expect(repository.findByIdentity).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('取得元と外部IDで検索し、存在しなければ初回日時付きで追加する', () => {
    expect(service.register(input, fetchedAt)).toBe(saved);
    const identity: ArticleIdentity = { sourceId: 'zenn', kind: 'id', value: 'article-1' };
    expect(repository.findByIdentity).toHaveBeenCalledWith(identity);
    expect(repository.insert).toHaveBeenCalledWith({ input, identity, fetchedAt });
    expect(repository.updateContent).not.toHaveBeenCalled();
  });

  it('IDなしはURLを変更せず識別条件にする', () => {
    service.register({ ...input, externalArticleId: null, url: `${input.url}?utm_source=test` });
    expect(repository.findByIdentity).toHaveBeenCalledWith({
      sourceId: 'zenn', kind: 'url', value: `${input.url}?utm_source=test`,
    });
  });

  it('同一記事はタイトル・概要・著者だけを更新し、日時と状態の変更を頼まない', () => {
    repository.findByIdentity.mockReturnValue(saved);
    service.register({ ...input, title: '変更後', description: '概要', author: '著者', url: 'https://example.com/new' });
    expect(repository.updateContent).toHaveBeenCalledWith(1, { title: '変更後', description: '概要', author: '著者' });
    expect(repository.insert).not.toHaveBeenCalled();
    expect(repository.updateState).not.toHaveBeenCalled();
  });

  it('任意項目がなくなった場合はnullに更新する', () => {
    repository.findByIdentity.mockReturnValue(saved);
    service.register(input);
    expect(repository.updateContent).toHaveBeenCalledWith(1, { title: input.title, description: null, author: null });
  });

  it('状態の不正値を拒否し、空の変更と既読解除を扱う', () => {
    expect(() => service.updateState(1, { lastOpenedAt: new Date('invalid') })).toThrow();
    expect(() => service.updateState(1, { interested: 1 as unknown as boolean })).toThrow();
    expect(repository.updateState).not.toHaveBeenCalled();
    service.updateState(1, {});
    service.updateState(1, { lastOpenedAt: null });
    expect(repository.updateState).toHaveBeenNthCalledWith(1, 1, {});
    expect(repository.updateState).toHaveBeenNthCalledWith(2, 1, { lastOpenedAt: null });
  });

  it('保存先の失敗を呼び出し側へ伝える', () => {
    repository.insert.mockImplementation(() => { throw new Error('保存失敗'); });
    expect(() => service.register(input)).toThrow('保存失敗');
  });
});
