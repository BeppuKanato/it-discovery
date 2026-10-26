import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { articles, articleInterestBatches } from '../../infrastructure/database/schema';
import { SettingsService } from '../../settings/services/settings.service';
import { SqliteSettingsRepository } from '../../settings/repositories/sqlite-settings.repository';
import { ArticleService } from '../services/article.service';
import { ArticleStateService } from '../services/article-state.service';
import { ArticleSortingService } from '../services/article-sorting.service';
import { SqliteArticleRepository } from './sqlite-article.repository';
import { SqliteArticleInterestBatchRepository } from './sqlite-article-interest-batch.repository';

describe('SQLiteの仕分け対象と一括登録', () => {
  let directory: string;
  let database: DatabaseService;
  let service: ArticleSortingService;
  let articleService: ArticleService;
  const oldPath = process.env['DATABASE_PATH'];
  const fetchedAt = new Date('2026-10-16T00:00:00.000Z');
  const connect = () => {
    database = new DatabaseService();
    new SettingsService(new SqliteSettingsRepository(database)).initialize();
    articleService = new ArticleService(new SqliteArticleRepository(database));
    service = new ArticleSortingService(new SqliteArticleRepository(database), new SqliteArticleInterestBatchRepository(database));
  };
  const add = (date = fetchedAt) => articleService.register({
    sourceId: 'zenn', url: `https://example.com/${randomUUID()}`, title: '仕分け用の記事',
  }, date).article.articleId;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'it-discovery-sorting-'));
    process.env['DATABASE_PATH'] = join(directory, 'test.db'); connect();
  });
  afterEach(() => {
    database?.onApplicationShutdown(); rmSync(directory, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env['DATABASE_PATH']; else process.env['DATABASE_PATH'] = oldPath;
  });

  it.each([0, 1, 7, 10, 15])('%s件の対象から最大10件を重複なく返す', (count) => {
    const ids = Array.from({ length: count }, () => add());
    const result = service.getCandidates();
    const selected = result.map((entry) => entry.article.articleId);
    expect(selected).toHaveLength(Math.min(count, 10));
    expect(new Set(selected).size).toBe(selected.length);
    expect(selected.every((id) => ids.includes(id))).toBe(true);
    expect(result.every((entry) => !entry.state.interested && !entry.state.pinned && !entry.state.lastOpenedAt)).toBe(true);
    expect(result.every((entry) => entry.source.siteName === 'Zenn')).toBe(true);
    expect(database.db.select().from(articleInterestBatches).all()).toHaveLength(0);
  });

  it('新しい既読・登録・ピン記事を除外し、古い記事も抽出対象にする', () => {
    const old = add(new Date('2026-10-01T00:00:00Z'));
    const newestEligible = add(new Date('2026-10-03T00:00:00Z'));
    const middle = add(new Date('2026-10-02T00:00:00Z'));
    for (let i = 0; i < 15; i++) {
      const id = add();
      articleService.updateState(id, i % 3 === 0 ? { interested: true } : i % 3 === 1 ? { pinned: true } : { lastOpenedAt: fetchedAt });
    }
    expect(service.getCandidates().map((entry) => entry.article.articleId).sort((a, b) => a - b))
      .toEqual([old, newestEligible, middle].sort((a, b) => a - b));
    expect(service.getCandidates().map((entry) => entry.article.articleId).sort((a, b) => a - b))
      .toEqual([old, newestEligible, middle].sort((a, b) => a - b));
  });

  it('最新10件に限定せず、取得ごとに抽出結果と順番を変える', () => {
    const ids = Array.from({ length: 30 }, () => add());
    // SQLiteの乱数だけを固定列へ置き換え、偶然に左右されず抽出範囲・再抽選を検証する。
    let index = 0;
    database.client.function('random', () => index++);
    const first = service.getCandidates().map((entry) => entry.article.articleId);
    index = 0;
    database.client.function('random', () => -(index++));
    const second = service.getCandidates().map((entry) => entry.article.articleId);
    expect(first).toHaveLength(10);
    expect(second).toHaveLength(10);
    expect(first).not.toEqual(second);
    expect(new Set([...first, ...second]).size).toBe(20);
    expect(first.concat(second).some((id) => !ids.slice(-10).includes(id))).toBe(true);
    // 通常の一覧は乱数関数の影響を受けず、これまでどおり新しい記事順。
    const list = new SqliteArticleRepository(database).findPage({ kind: 'all', limit: 10 });
    expect(list.map((entry) => entry.article.articleId)).toEqual(ids.slice(-10).reverse());
  });

  it('現在は既読・ピンありでも最終登録でき、送られない記事と他の状態を変えない', () => {
    const first = add(); const second = add(); const untouched = add();
    articleService.updateState(first, { pinned: true, lastOpenedAt: fetchedAt });
    articleService.updateState(untouched, { interested: true });
    service.submit(randomUUID(), { revision: 3, articleIds: [first, second] });
    expect(articleService.findById(first)?.state).toEqual({ interested: true, pinned: true, lastOpenedAt: fetchedAt });
    expect(articleService.findById(second)?.state).toEqual({ interested: true, pinned: false, lastOpenedAt: null });
    expect(articleService.findById(untouched)?.state.interested).toBe(true);
  });

  it('途中削除をmissingにし、残った記事の登録と結果を一緒に保存する', () => {
    const first = add(); const missing = add(); const last = add();
    database.db.delete(articles).where(eq(articles.articleId, missing)).run();
    const batchId = randomUUID();
    const result = service.submit(batchId, { revision: 2, articleIds: [last, first, missing] });
    expect(result.results).toEqual([{ articleId: first, status: 'saved' }, { articleId: missing, status: 'missing' }, { articleId: last, status: 'saved' }]);
    expect(articleService.findById(missing)).toBeUndefined();
    expect(service.getBatch(batchId)).toEqual(result);
  });

  it('登録→一覧で解除→再接続→古い一括登録の再送でも解除を維持する', () => {
    const id = add(); const batchId = randomUUID();
    const result = service.submit(batchId, { revision: 5, articleIds: [id] });
    const stateService = new ArticleStateService(new SqliteArticleRepository(database));
    stateService.apply(id, { change: { kind: 'interested', value: false } });
    database.onApplicationShutdown(); connect();
    expect(service.submit(batchId, { revision: 5, articleIds: [id] })).toEqual(result);
    expect(articleService.findById(id)?.state.interested).toBe(false);
    expect(database.db.select().from(articleInterestBatches).all()).toHaveLength(1);
  });

  it('記事削除後も保存済みの結果を返し、別版を受け入れない', () => {
    const id = add(); const batchId = randomUUID();
    const result = service.submit(batchId, { revision: 2, articleIds: [id] });
    database.db.delete(articles).where(eq(articles.articleId, id)).run();
    expect(service.getBatch(batchId)).toEqual(result);
    expect(service.submit(batchId, { revision: 2, articleIds: [id] })).toEqual(result);
    expect(() => service.submit(batchId, { revision: 3, articleIds: [] })).toThrow('すでに確定');
    expect(articleService.findById(id)).toBeUndefined();
  });

  it('途中の記事更新に失敗したら、先に登録した記事も取り消す', () => {
    const first = add(); const second = add(); const batchId = randomUUID();
    database.client.exec(`CREATE TRIGGER fail_second BEFORE UPDATE OF interested ON article_states WHEN NEW.article_id = ${second} BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
    expect(() => service.submit(batchId, { revision: 1, articleIds: [first, second] })).toThrow();
    expect(articleService.findById(first)?.state.interested).toBe(false);
    expect(articleService.findById(second)?.state.interested).toBe(false);
    expect(service.getBatch(batchId)).toBeUndefined();
    database.client.exec('DROP TRIGGER fail_second');
    expect(service.submit(batchId, { revision: 1, articleIds: [first, second] }).results.every((item) => item.status === 'saved')).toBe(true);
  });

  it('結果記録に失敗した場合も、全記事の登録を取り消す', () => {
    const ids = [add(), add()]; const batchId = randomUUID();
    database.client.exec("CREATE TRIGGER fail_batch BEFORE INSERT ON article_interest_batches BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    expect(() => service.submit(batchId, { revision: 1, articleIds: ids })).toThrow();
    expect(ids.every((id) => articleService.findById(id)?.state.interested === false)).toBe(true);
    expect(service.getBatch(batchId)).toBeUndefined();
  });

  it('空集合・全件missingも再送可能な結果として記録する', () => {
    for (const ids of [[], [999, 1000]]) {
      const batchId = randomUUID();
      const result = service.submit(batchId, { revision: 1, articleIds: ids });
      expect(result.results.every((item) => item.status === 'missing')).toBe(true);
      expect(service.submit(batchId, { revision: 1, articleIds: ids })).toEqual(result);
    }
    expect(database.db.select().from(articles).all()).toHaveLength(0);
  });
});
