import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { articles, articleStates } from '../../database/schema';
import { SqliteConfigRepository } from '../../config/sqlite-config.repository';
import { defaultSources } from '../../config/default-sources';
import { isProtected, isRead, isSortingCandidate } from '../domain/article-state';
import { SqliteArticleRepository } from './sqlite-article.repository';

describe('SQLiteの記事と設定の永続保存', () => {
  let directory: string;
  let database: DatabaseService;
  let repository: SqliteArticleRepository;
  let configs: SqliteConfigRepository;
  const oldPath = process.env['DATABASE_PATH'];
  const input = { sourceId: 'zenn', externalArticleId: 'article-1', url: 'https://example.com/1', title: '最初のタイトル' };
  const firstDate = new Date('2026-10-01T00:00:00Z');

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'it-discovery-db-'));
    process.env['DATABASE_PATH'] = join(directory, 'nested', 'test.db');
    database = new DatabaseService();
    configs = new SqliteConfigRepository(database);
    configs.addDefaults(defaultSources);
    repository = new SqliteArticleRepository(database);
  });

  afterEach(() => {
    if (database.client.open) database.onApplicationShutdown();
    rmSync(directory, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env['DATABASE_PATH'];
    else process.env['DATABASE_PATH'] = oldPath;
  });

  it('再取得で内容だけを更新し、初回日時・既読・気になる・ピンを維持する', () => {
    const saved = repository.upsert(input, firstDate);
    const lastOpenedAt = new Date('2026-10-02T00:00:00Z');
    repository.updateState(saved.article.articleId, { interested: true, pinned: true, lastOpenedAt });
    const updated = repository.upsert({ ...input, title: '更新後', url: 'https://example.com/new' }, new Date());
    expect(updated.article.articleId).toBe(saved.article.articleId);
    expect(updated.article.title).toBe('更新後');
    expect(updated.article.fetchedAt).toEqual(firstDate);
    expect(updated.state).toMatchObject({ interested: true, pinned: true, lastOpenedAt });
    expect(database.db.select().from(articles).all()).toHaveLength(1);
  });

  it('IDなしはURL完全一致で判定し、別取得元やURL違いは別記事にする', () => {
    const noId = { ...input, externalArticleId: null };
    const first = repository.upsert(noId);
    expect(repository.upsert(noId).article.articleId).toBe(first.article.articleId);
    repository.upsert({ ...noId, sourceId: 'syntax_podcast' });
    repository.upsert({ ...noId, url: `${input.url}?utm_source=test` });
    repository.upsert({ ...input, externalArticleId: input.url });
    expect(database.db.select().from(articles).all()).toHaveLength(4);
  });

  it('接続を閉じ再マイグレーションしても記事・状態・設定が残る', () => {
    const saved = repository.upsert(input, firstDate);
    repository.updateState(saved.article.articleId, { interested: true });
    configs.saveSettings({ ...configs.getSettings(), unreadRetentionDays: 90 });
    configs.saveSource({ ...defaultSources[0]!, enabled: false, maxPerRun: 10 });
    database.onApplicationShutdown();
    database = new DatabaseService();
    repository = new SqliteArticleRepository(database);
    configs = new SqliteConfigRepository(database);
    configs.addDefaults(defaultSources);
    expect(repository.findById(saved.article.articleId)?.state.interested).toBe(true);
    expect(configs.getSettings().unreadRetentionDays).toBe(90);
    expect(configs.listSources().find((source) => source.sourceId === 'zenn')).toMatchObject({ enabled: false, maxPerRun: 10 });
  });

  it('状態の一項目の保存で他の項目を変えない', () => {
    const saved = repository.upsert(input);
    repository.updateState(saved.article.articleId, { interested: true, pinned: true });
    const changed = repository.updateState(saved.article.articleId, { interested: false });
    expect(changed?.state).toMatchObject({ interested: false, pinned: true, lastOpenedAt: null });
    expect(repository.updateState(999, { interested: true })).toBeUndefined();
  });

  it('記事削除で状態も削除し、再取得は新しいIDと未読状態になる', () => {
    const saved = repository.upsert(input, firstDate);
    repository.updateState(saved.article.articleId, { lastOpenedAt: firstDate });
    database.db.delete(articles).where(eq(articles.articleId, saved.article.articleId)).run();
    expect(database.db.select().from(articleStates).all()).toHaveLength(0);
    const restored = repository.upsert(input, new Date('2026-10-09T00:00:00Z'));
    expect(restored.article.articleId).toBeGreaterThan(saved.article.articleId);
    expect(restored.state.lastOpenedAt).toBeNull();
    expect(restored.article.fetchedAt).not.toEqual(firstDate);
  });

  it('記事と状態の保存途中の失敗は記事追加もロールバックする', () => {
    database.client.exec("CREATE TRIGGER reject_state BEFORE INSERT ON article_states BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    expect(() => repository.upsert(input)).toThrow();
    expect(database.db.select().from(articles).all()).toHaveLength(0);
  });

  it('同一照合キー・重複取得先・存在しない取得元をDB制約で拒否する', () => {
    const saved = repository.upsert(input);
    expect(() => database.db.insert(articles).values({ ...saved.article, articleId: undefined, identityKind: 'id', identityValue: 'article-1' }).run()).toThrow();
    expect(() => configs.saveSource({ ...defaultSources[0]!, sourceId: 'another-source' })).toThrow();
    expect(() => repository.upsert({ ...input, sourceId: 'missing-source' })).toThrow();
  });

  it('日時・期限・上限・取得件数の不正値を拒否する', () => {
    expect(() => repository.upsert(input, new Date('invalid'))).toThrow();
    expect(() => configs.saveSettings({ ...configs.getSettings(), maxArticles: 0 })).toThrow();
    expect(() => configs.saveSource({ ...defaultSources[0]!, maxPerRun: 0 })).toThrow();
    expect(() => database.db.run(sql`UPDATE app_settings SET unread_retention_days = 0`)).toThrow();
  });

  it('既読・仕分け対象・保護を独立した状態から判定する', () => {
    const saved = repository.upsert(input);
    expect(isSortingCandidate(saved.state)).toBe(true);
    expect(isRead(saved.state)).toBe(false);
    expect(isProtected(saved.state)).toBe(false);
    expect(isSortingCandidate({ ...saved.state, pinned: true })).toBe(false);
    expect(isProtected({ ...saved.state, interested: true })).toBe(true);
    expect(isRead({ ...saved.state, lastOpenedAt: firstDate })).toBe(true);
  });
});
