import 'reflect-metadata';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { articles, articleStateOperations } from '../../infrastructure/database/schema';
import { SettingsService } from '../../settings/services/settings.service';
import { SqliteSettingsRepository } from '../../settings/repositories/sqlite-settings.repository';
import { ArticleService } from '../services/article.service';
import { ArticleStateService } from '../services/article-state.service';
import { SqliteArticleRepository } from './sqlite-article.repository';

// 一時DBだけを使い、実際のマイグレーション・トランザクション・再接続を確認する。
describe('SQLiteの記事状態の直接保存', () => {
  let directory: string;
  let database: DatabaseService;
  let service: ArticleStateService;
  let articleId: number;
  const oldPath = process.env['DATABASE_PATH'];
  const makeService = () => new ArticleStateService(new SqliteArticleRepository(database));
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'it-discovery-state-'));
    process.env['DATABASE_PATH'] = join(directory, 'test.db');
    database = new DatabaseService();
    new SettingsService(new SqliteSettingsRepository(database)).initialize();
    articleId = new ArticleService(new SqliteArticleRepository(database)).register({
      sourceId: 'zenn', url: 'https://example.com/1', title: '記事',
    }).article.articleId;
    service = makeService();
  });
  afterEach(() => {
    database?.onApplicationShutdown();
    rmSync(directory, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env['DATABASE_PATH'];
    else process.env['DATABASE_PATH'] = oldPath;
  });
  const set = (kind: 'interested' | 'pinned', value: boolean) =>
    service.apply(articleId, { change: { kind, value } });

  it('登録・解除・同じ値の保存を行い、操作記録には依存しない', () => {
    // 旧表への書き込みを失敗させても、新しい状態保存は成功する。
    database.client.exec("CREATE TRIGGER fail_operation BEFORE INSERT ON article_state_operations BEGIN SELECT RAISE(ABORT, 'unused table'); END;");
    set('interested', true); set('pinned', true); set('interested', false); set('pinned', true);
    expect(service.getState(articleId)).toEqual({ interested: false, pinned: true, lastOpenedAt: null });
    expect(database.db.select().from(articleStateOperations).all()).toEqual([]);
  });

  it('複数の既読日時を送っても最大日時を保持し、ピンと登録を維持する', () => {
    set('interested', true); set('pinned', true);
    for (const openedAt of ['2026-10-15T10:00:00.000Z', '2026-10-16T10:00:00.000Z', '2026-10-14T10:00:00.000Z']) {
      service.apply(articleId, { change: { kind: 'opened', openedAt } });
    }
    expect(service.getState(articleId)).toEqual({ interested: true, pinned: true, lastOpenedAt: new Date('2026-10-16T10:00:00.000Z') });
  });

  it('再接続しても記事の確定状態を保持する', () => {
    set('pinned', true);
    database.onApplicationShutdown(); database = new DatabaseService(); service = makeService();
    expect(service.getState(articleId)?.pinned).toBe(true);
  });

  it('削除済み記事を作り直さない', () => {
    database.db.delete(articles).where(eq(articles.articleId, articleId)).run();
    expect(set('pinned', true)).toBeUndefined();
    expect(database.db.select().from(articles).all()).toHaveLength(0);
  });

  it('DBの更新が失敗した場合は保存結果を返さず、元の状態を保つ', () => {
    database.client.exec("CREATE TRIGGER fail_state BEFORE UPDATE ON article_states BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    expect(() => set('interested', true)).toThrow();
    expect(service.getState(articleId)?.interested).toBe(false);
  });

  it('既存の操作記録を削除せず、その表がなくても状態を保存できる', () => {
    database.client.exec("INSERT INTO article_state_operations(operation_id,request_key,article_id,status,interested,pinned) VALUES ('legacy','legacy',1,'saved',0,0);");
    set('pinned', true);
    expect(database.db.select().from(articleStateOperations).all()).toHaveLength(1);
    database.client.exec('DROP TABLE article_state_operations');
    set('interested', true);
    expect(service.getState(articleId)).toMatchObject({ interested: true, pinned: true });
  });

  it('旧マイグレーション適用済みのDBへ、既存記事を残して表を追加できる', () => {
    const migrations = join(directory, 'old-migrations');
    mkdirSync(join(migrations, 'meta'), { recursive: true });
    const source = resolve(__dirname, '../../../drizzle');
    copyFileSync(join(source, '0000_daily_old_lace.sql'), join(migrations, '0000_daily_old_lace.sql'));
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'));
    journal.entries = journal.entries.slice(0, 1);
    writeFileSync(join(migrations, 'meta/_journal.json'), JSON.stringify(journal));
    const filename = join(directory, 'upgrade.db');
    const client = new Database(filename);
    try {
      migrate(drizzle(client), { migrationsFolder: migrations });
      client.exec("INSERT INTO sources(source_id,site_name,endpoint,adapter_kind) VALUES ('old','旧出典','https://example.com/feed','rss-atom'); INSERT INTO articles(source_id,identity_kind,identity_value,url,title,fetched_at) VALUES ('old','url','https://example.com/old','https://example.com/old','既存記事',1); INSERT INTO article_states(article_id,interested,pinned) VALUES (1,1,1);");
    } finally { client.close(); }
    process.env['DATABASE_PATH'] = filename;
    const upgraded = new DatabaseService();
    try {
      expect(upgraded.db.select().from(articles).get()?.title).toBe('既存記事');
      expect(new SqliteArticleRepository(upgraded).findById(1)?.state).toMatchObject({ interested: true, pinned: true });
      expect(upgraded.db.select().from(articleStateOperations).all()).toEqual([]);
    } finally { upgraded.onApplicationShutdown(); }
  });
});
