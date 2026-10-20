import { DatabaseService } from '../../infrastructure/database/database.service';
import { SqliteSettingsRepository } from '../../settings/repositories/sqlite-settings.repository';
import { SettingsService } from '../../settings/services/settings.service';
import { SqliteArticleRepository } from '../repositories/sqlite-article.repository';
import { ArticleService } from './article.service';
import { ArticleRetentionService } from './article-retention.service';

const now = new Date('2026-10-20T00:00:00Z');
const policy = { unreadRetentionDays: 30, maxArticles: 100 };
const old = new Date('2026-09-19T00:00:00Z');
const boundary = new Date('2026-09-20T00:00:00Z');
const input = (id: string) => ({ sourceId: 'zenn', externalArticleId: id, title: id, url: `https://example.com/${id}` });

describe('SQLiteの記事保持・追加判定', () => {
  let database: DatabaseService;
  let articles: ArticleService;
  let retention: ArticleRetentionService;
  const previous = process.env['DATABASE_PATH'];
  beforeEach(() => {
    process.env['DATABASE_PATH'] = ':memory:';
    database = new DatabaseService();
    new SettingsService(new SqliteSettingsRepository(database)).initialize();
    const repository = new SqliteArticleRepository(database);
    articles = new ArticleService(repository);
    retention = new ArticleRetentionService(repository, articles);
  });
  afterEach(() => {
    database.onApplicationShutdown();
    if (previous === undefined) delete process.env['DATABASE_PATH'];
    else process.env['DATABASE_PATH'] = previous;
  });
  const ids = (db: DatabaseService) => db.client.prepare('SELECT external_article_id FROM articles ORDER BY article_id').all() as { external_article_id: string }[];

  it('期限は取得日時から判定し、境界・既読・気になる・ピンを保護する', () => {
    articles.register(input('expired'), old);
    articles.register(input('boundary'), boundary);
    for (const patch of [{ interested: true }, { pinned: true }, { lastOpenedAt: old }]) {
      const saved = articles.register(input(String(Object.keys(patch)[0])), old);
      articles.updateState(saved.article.articleId, patch);
    }
    expect(retention.sweep(policy, now)).toBe(1);
    expect(ids(database)).toEqual(['boundary', 'interested', 'pinned', 'lastOpenedAt'].map((id) => ({ external_article_id: id })));
    expect(database.client.prepare('SELECT count(*) AS n FROM article_states').get()).toEqual({ n: 4 });
  });

  it('未読の取得日時・ID順を優先し、その後に既読の最終閲覧日時・ID順で削除する', () => {
    const read1 = articles.register(input('read1'), old);
    const read2 = articles.register(input('read2'), old);
    articles.updateState(read1.article.articleId, { lastOpenedAt: old });
    articles.updateState(read2.article.articleId, { lastOpenedAt: now });
    articles.register(input('unread1'), now);
    articles.register(input('unread2'), now);
    expect(retention.sweep({ ...policy, maxArticles: 3 }, now)).toBe(1);
    expect(ids(database).map((r) => r.external_article_id)).toEqual(['read1', 'read2', 'unread2']);
    expect(retention.sweep({ ...policy, maxArticles: 1 }, now)).toBe(2);
    expect(ids(database)).toEqual([{ external_article_id: 'read2' }]);
  });

  it('保護だけで上限を超えても保持し、既存更新を許可、保護解除後に新規を再開する', () => {
    const saved = ['p1', 'p2'].map((id) => articles.register(input(id), now));
    for (const row of saved) articles.updateState(row.article.articleId, { pinned: true });
    const small = { ...policy, maxArticles: 1 };
    expect(retention.sweep(small, now)).toBe(0);
    expect(retention.save(input('new'), small, now)).toBe('capacity');
    expect(retention.save({ ...input('p1'), title: 'updated' }, small, now)).toBe('updated');
    expect(articles.findById(saved[0]!.article.articleId)?.state.pinned).toBe(true);
    for (const row of saved) articles.updateState(row.article.articleId, { pinned: false });
    expect(retention.save(input('new'), small, new Date(now.getTime() + 1))).toBe('added');
    expect(ids(database)).toEqual([{ external_article_id: 'new' }]);
  });

  it('挿入の失敗で直前の期限削除も状態も巻き戻す', () => {
    const expired = articles.register(input('expired'), old);
    database.client.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON articles BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    expect(() => retention.save(input('new'), policy, now)).toThrow('test failure');
    expect(articles.findById(expired.article.articleId)).toBeDefined();
    expect(ids(database)).toEqual([{ external_article_id: 'expired' }]);
  });

  it('上限削除の失敗で同じ単位の新規挿入を巻き戻す', () => {
    articles.register(input('old'), now);
    database.client.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON articles BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    expect(() => retention.save(input('new'), { ...policy, maxArticles: 1 }, new Date(now.getTime() + 1))).toThrow('test failure');
    expect(ids(database)).toEqual([{ external_article_id: 'old' }]);
  });
});
