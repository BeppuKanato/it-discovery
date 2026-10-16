import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
import { SqliteArticleStateOperationRepository } from './sqlite-article-state-operation.repository';

// 一時DBだけを使い、実際のマイグレーション・トランザクション・再接続を確認する。
describe('SQLiteの状態変更と操作結果の保存', () => {
  let directory: string;
  let database: DatabaseService;
  let service: ArticleStateService;
  let articleId: number;
  const oldPath = process.env['DATABASE_PATH'];
  const makeService = () => new ArticleStateService(new SqliteArticleRepository(database), new SqliteArticleStateOperationRepository(database));
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
  const set = (kind: 'interested' | 'pinned', value: boolean, operationId = randomUUID()) =>
    service.apply(articleId, { operationId, change: { kind, value } });

  it('登録→解除の後に古い登録を再送しても、解除を巻き戻さない', () => {
    const operationId = randomUUID();
    const first = set('interested', true, operationId);
    set('pinned', true); set('interested', false);
    expect(set('interested', true, operationId)).toEqual(first);
    expect(service.getState(articleId)).toEqual({ interested: false, pinned: true, lastOpenedAt: null });
    expect(database.db.select().from(articleStateOperations).all()).toHaveLength(3);
  });

  it('複数の既読日時を送っても最大日時を保持し、ピンと登録を維持する', () => {
    set('interested', true); set('pinned', true);
    for (const openedAt of ['2026-10-15T10:00:00.000Z', '2026-10-16T10:00:00.000Z', '2026-10-14T10:00:00.000Z']) {
      service.apply(articleId, { operationId: randomUUID(), change: { kind: 'opened', openedAt } });
    }
    expect(service.getState(articleId)).toEqual({ interested: true, pinned: true, lastOpenedAt: new Date('2026-10-16T10:00:00.000Z') });
  });

  it('接続を作り直しても操作結果と再送の判定が残る', () => {
    const operationId = randomUUID();
    const first = set('pinned', true, operationId);
    set('pinned', false);
    database.onApplicationShutdown(); database = new DatabaseService(); service = makeService();
    expect(service.getOperation(operationId)).toEqual(first);
    expect(set('pinned', true, operationId)).toEqual(first);
    expect(service.getState(articleId)?.pinned).toBe(false);
  });

  it('記事削除後も以前の結果を再送でき、新しい操作はmissingとして残す', () => {
    const operationId = randomUUID();
    const first = set('pinned', true, operationId);
    database.db.delete(articles).where(eq(articles.articleId, articleId)).run();
    expect(set('pinned', true, operationId)).toEqual(first);
    const missingId = randomUUID();
    const missing = set('pinned', true, missingId);
    expect(missing).toEqual({ operationId: missingId, articleId, status: 'missing', state: null });
    expect(set('pinned', true, missingId)).toEqual(missing);
    expect(database.db.select().from(articles).all()).toHaveLength(0);
  });

  it('操作結果の保存が失敗すると、先に行った状態変更も取り消す', () => {
    const operationId = randomUUID();
    database.client.exec("CREATE TRIGGER fail_operation BEFORE INSERT ON article_state_operations BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    expect(() => set('interested', true, operationId)).toThrow();
    expect(service.getState(articleId)?.interested).toBe(false);
    expect(service.getOperation(operationId)).toBeUndefined();
    database.client.exec('DROP TRIGGER fail_operation');
    expect(set('interested', true, operationId).status).toBe('saved');
  });

  it('同じ操作IDの内容違いを拒否して既存の状態と結果を変えない', () => {
    const operationId = randomUUID();
    set('interested', true, operationId);
    expect(() => set('interested', false, operationId)).toThrow('同じ操作ID');
    expect(service.getState(articleId)?.interested).toBe(true);
    expect(database.db.select().from(articleStateOperations).all()).toHaveLength(1);
  });

  it('操作結果の記録後に例外が発生しても、両方の保存を取り消す', () => {
    const operations = new SqliteArticleStateOperationRepository(database);
    const insert = operations.insert.bind(operations);
    jest.spyOn(operations, 'insert').mockImplementation((record) => { insert(record); throw new Error('after insert'); });
    const failing = new ArticleStateService(new SqliteArticleRepository(database), operations);
    const operationId = randomUUID();
    expect(() => failing.apply(articleId, { operationId, change: { kind: 'pinned', value: true } })).toThrow('after insert');
    expect(service.getState(articleId)?.pinned).toBe(false);
    expect(service.getOperation(operationId)).toBeUndefined();
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
