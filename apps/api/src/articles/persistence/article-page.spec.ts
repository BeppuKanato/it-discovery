import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { articles } from '../../infrastructure/database/schema';
import { SettingsService } from '../../settings/application/settings.service';
import { SqliteSettingsRepository } from '../../settings/persistence/sqlite-settings.repository';
import { ArticleService } from '../application/article.service';
import type { ArticlePagePosition } from '../models/article-page';
import { SqliteArticleRepository } from './sqlite-article.repository';

describe('SQLiteの記事一覧の分割取得', () => {
  let directory: string;
  let database: DatabaseService;
  let service: ArticleService;
  let settings: SettingsService;
  const oldPath = process.env['DATABASE_PATH'];
  const fetchedAt = new Date('2026-10-01T00:00:00Z');

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'it-discovery-page-'));
    process.env['DATABASE_PATH'] = join(directory, 'test.db');
    database = new DatabaseService();
    settings = new SettingsService(new SqliteSettingsRepository(database));
    settings.initialize();
    service = new ArticleService(new SqliteArticleRepository(database));
  });

  afterEach(() => {
    if (database.client.open) database.onApplicationShutdown();
    rmSync(directory, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env['DATABASE_PATH'];
    else process.env['DATABASE_PATH'] = oldPath;
  });

  // 指定日時の確認用記事を保存する。
  function add(index: number, date = fetchedAt) {
    return service.register({
      sourceId: 'zenn', externalArticleId: `article-${index}`,
      url: `https://example.com/${index}`, title: `記事${index}`,
    }, date);
  }

  it('53件を20・20・13件に分け、日時と同時刻のIDを降順にする', () => {
    const saved = Array.from({ length: 53 }, (_, index) => add(index,
      new Date(fetchedAt.getTime() + (index % 3) * 1000)));
    const expected = saved.sort((a, b) => b.article.fetchedAt.getTime() - a.article.fetchedAt.getTime()
      || b.article.articleId - a.article.articleId).map((entry) => entry.article.articleId);
    const actual: number[] = [];
    let before: ArticlePagePosition | undefined;
    for (const [index, size] of [20, 20, 13].entries()) {
      const page = service.getPage({ kind: 'all', limit: 20, before });
      expect(page.articles).toHaveLength(size);
      expect(page.hasMore).toBe(index < 2);
      actual.push(...page.articles.map((entry) => entry.article.articleId));
      before = page.nextPosition ?? undefined;
    }
    expect(before).toBeUndefined();
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(53);
  });

  it('全記事には既読・ピンも含め、気になる一覧は登録済みだけを分割する', () => {
    const expected: number[] = [];
    for (let index = 0; index < 45; index++) {
      const saved = add(index);
      const interested = index % 2 === 0;
      service.updateState(saved.article.articleId, { interested, pinned: true, lastOpenedAt: fetchedAt });
      if (interested) expected.unshift(saved.article.articleId);
    }
    const first = service.getPage({ kind: 'interested', limit: 20 });
    const second = service.getPage({ kind: 'interested', limit: 20, before: first.nextPosition! });
    expect(first.articles).toHaveLength(20);
    expect(second.articles).toHaveLength(3);
    expect(second.hasMore).toBe(false);
    expect([...first.articles, ...second.articles].map((entry) => entry.article.articleId)).toEqual(expected);
    expect(first.articles.every((entry) => entry.state.interested && entry.state.pinned
      && entry.state.lastOpenedAt?.getTime() === fetchedAt.getTime())).toBe(true);
    expect(service.getPage({ kind: 'all', limit: 20 }).articles).toHaveLength(20);
  });

  it('カーソルの記事が削除され新着が増えても、残りを重複なく取得する', () => {
    const saved = Array.from({ length: 5 }, (_, index) => add(index));
    const first = service.getPage({ kind: 'all', limit: 2 });
    database.db.delete(articles).where(eq(articles.articleId, first.nextPosition!.articleId)).run();
    const newest = add(100, new Date(fetchedAt.getTime() + 1000));
    const second = service.getPage({ kind: 'all', limit: 2, before: first.nextPosition! });
    expect(second.articles.map((entry) => entry.article.articleId)).toEqual([
      saved[2]!.article.articleId, saved[1]!.article.articleId,
    ]);
    const last = service.getPage({ kind: 'all', limit: 2, before: second.nextPosition! });
    expect(last.articles.map((entry) => entry.article.articleId)).toEqual([saved[0]!.article.articleId]);
    expect(last.nextPosition).toBeNull();
    expect(service.getPage({ kind: 'all', limit: 2 }).articles[0]?.article.articleId).toBe(newest.article.articleId);
  });

  it('取得先が無効でも保存済み記事を返し、取得先情報と状態を対応付ける', () => {
    const source = settings.listSources().find((entry) => entry.sourceId === 'zenn')!;
    settings.saveSource({ ...source, siteName: '表示名', iconUrl: 'https://example.com/icon.png', enabled: false });
    const saved = add(1);
    service.updateState(saved.article.articleId, { interested: true });
    const entry = service.getPage({ kind: 'all', limit: 20 }).articles[0]!;
    expect(entry.source).toEqual({ sourceId: 'zenn', siteName: '表示名', iconUrl: 'https://example.com/icon.png' });
    expect(entry.state.interested).toBe(true);
    expect(entry.article).not.toHaveProperty('identityKind');
    expect(entry.source).not.toHaveProperty('endpoint');
  });

  it('空一覧と存在しない位置の後ろは、続きなしの空結果にする', () => {
    expect(service.getPage({ kind: 'all', limit: 20 })).toEqual({ articles: [], hasMore: false, nextPosition: null });
    add(1);
    expect(service.getPage({ kind: 'interested', limit: 20 }).articles).toHaveLength(0);
    expect(service.getPage({ kind: 'all', limit: 20, before: {
      fetchedAt: new Date('2020-01-01T00:00:00Z'), articleId: 1,
    } })).toEqual({ articles: [], hasMore: false, nextPosition: null });
  });
});
