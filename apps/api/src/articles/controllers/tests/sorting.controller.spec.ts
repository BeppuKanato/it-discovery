import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { SortingCandidatesResponse, InterestBatchResponse } from '@it-discovery/contracts';
import { AppModule } from '../../../app.module';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { articles, articleInterestBatches } from '../../../infrastructure/database/schema';
import { ArticleService } from '../../services/article.service';
import { ArticleSortingService } from '../../services/article-sorting.service';

describe('仕分けのHTTP API', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let articleService: ArticleService;
  let directory: string;
  let base: string;
  const oldPath = process.env['DATABASE_PATH'];
  const fetchedAt = new Date('2026-10-16T00:00:00.000Z');
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'it-discovery-sorting-http-'));
    process.env['DATABASE_PATH'] = join(directory, 'test.db');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api`;
    database = app.get(DatabaseService); articleService = app.get(ArticleService);
  }, 30000);
  beforeEach(() => {
    // このテスト専用の一時DBだけを初期化する。通常のアプリのDBは使わない。
    database.db.delete(articleInterestBatches).run(); database.db.delete(articles).run();
  });
  afterAll(async () => {
    await app?.close(); if (directory) rmSync(directory, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env['DATABASE_PATH']; else process.env['DATABASE_PATH'] = oldPath;
  });
  const add = () => articleService.register({ sourceId: 'zenn', url: `https://example.com/${randomUUID()}`, title: '仕分けする記事' }, fetchedAt).article.articleId;
  const url = (batchId: string) => `${base}/sorting/interest-batches/${batchId}`;
  const put = (batchId: string, body: unknown) => fetch(url(batchId), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  it.each([0, 1, 8, 10, 13])('%s件から最大10件の表示情報を返す', async (count) => {
    const ids = Array.from({ length: count }, () => add());
    const response = await fetch(`${base}/sorting/candidates`);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const result = await response.json() as SortingCandidatesResponse;
    expect(Object.keys(result)).toEqual(['articles']);
    const selected = result.articles.map((item) => item.articleId);
    expect(selected).toHaveLength(Math.min(count, 10));
    expect(new Set(selected).size).toBe(selected.length);
    expect(selected.every((id) => ids.includes(id))).toBe(true);
    for (const item of result.articles) {
      expect(item).toMatchObject({ title: '仕分けする記事', fetchedAt: fetchedAt.toISOString(), publishedAt: null,
        description: null, source: { sourceId: 'zenn', siteName: 'Zenn', iconUrl: null },
        state: { interested: false, pinned: false, lastOpenedAt: null } });
    }
  });

  it('既読・ピン・登録済みを除外し、対象取得を繰り返しても対象を消費しない', async () => {
    const eligible = add();
    for (const patch of [{ interested: true }, { pinned: true }, { lastOpenedAt: fetchedAt }]) articleService.updateState(add(), patch);
    const get = () => fetch(`${base}/sorting/candidates`).then((r) => r.json()) as Promise<SortingCandidatesResponse>;
    expect((await get()).articles.map((item) => item.articleId)).toEqual([eligible]);
    expect((await get()).articles.map((item) => item.articleId)).toEqual([eligible]);
    expect(database.db.select().from(articleInterestBatches).all()).toHaveLength(0);
  });

  it('最終集合だけを登録し、既読・ピンを維持する', async () => {
    const ids = [add(), add(), add()];
    articleService.updateState(ids[0]!, { pinned: true, lastOpenedAt: fetchedAt });
    const batchId = randomUUID();
    const response = await put(batchId, { revision: 4, articleIds: [ids[1], ids[0]] });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const result = { batchId, revision: 4, results: ids.slice(0, 2).map((articleId) => ({ articleId, status: 'saved' })) };
    expect(await response.json()).toEqual(result);
    expect(articleService.findById(ids[0]!)?.state).toEqual({ interested: true, pinned: true, lastOpenedAt: fetchedAt });
    expect(articleService.findById(ids[2]!)?.state.interested).toBe(false);
    const confirmed = await fetch(url(batchId));
    expect(confirmed.status).toBe(200); expect(confirmed.headers.get('cache-control')).toBe('no-store');
    expect(await confirmed.json()).toEqual(result);
  });

  it('10件をまとめて登録でき、全件が次の仕分け対象から外れる', async () => {
    const ids = Array.from({ length: 10 }, () => add());
    const response = await put(randomUUID(), { revision: 1, articleIds: ids });
    expect(response.status).toBe(200);
    expect((await response.json() as InterestBatchResponse).results).toHaveLength(10);
    expect(await fetch(`${base}/sorting/candidates`).then((r) => r.json())).toEqual({ articles: [] });
  });

  it('状態APIで後から解除した記事を、古い一括登録の再送で登録へ戻さない', async () => {
    const id = add(); const batchId = randomUUID(); const body = { revision: 1, articleIds: [id] };
    const first = await put(batchId, body).then((r) => r.json());
    const unregistered = await fetch(`${base}/articles/${id}/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change: { kind: 'interested', value: false } }) });
    expect(unregistered.status).toBe(200);
    expect(await put(batchId.toUpperCase(), body).then((r) => r.json())).toEqual(first);
    expect(articleService.findById(id)?.state.interested).toBe(false);
  });

  it('削除済みと保存済みを混ぜて返し、missingだけでも確定結果を返す', async () => {
    const kept = add(); const deleted = add();
    database.db.delete(articles).where(eq(articles.articleId, deleted)).run();
    const response = await put(randomUUID(), { revision: 1, articleIds: [kept, deleted] });
    expect(response.status).toBe(200);
    expect((await response.json() as InterestBatchResponse).results)
      .toEqual([{ articleId: kept, status: 'saved' }, { articleId: deleted, status: 'missing' }]);
    const result = await put(randomUUID(), { revision: 1, articleIds: [deleted] }).then((r) => r.json()) as InterestBatchResponse;
    expect(result.results).toEqual([{ articleId: deleted, status: 'missing' }]);
    expect(articleService.findById(deleted)).toBeUndefined();
  });

  it('同時に同じ回の要求が届いても結果は一件だけ保存する', async () => {
    const batchId = randomUUID(); const body = { revision: 1, articleIds: [add()] };
    const responses = await Promise.all([put(batchId, body), put(batchId, body), put(batchId, body)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    expect(database.db.select().from(articleInterestBatches).all()).toHaveLength(1);
  });

  it('未記録の回は404と専用コード、空集合は200を返す', async () => {
    const batchId = randomUUID();
    const response = await fetch(url(batchId));
    expect(response.status).toBe(404); expect(await response.json()).toMatchObject({ code: 'BATCH_NOT_FOUND' });
    const result = { batchId, revision: 1, results: [] };
    expect(await put(batchId, { revision: 1, articleIds: [] }).then((r) => r.json())).toEqual(result);
    expect(await fetch(url(batchId)).then((r) => r.json())).toEqual(result);
  });

  it('受理済みの別版・別集合は409で拒否し、同じ集合の列挙順違いは許可する', async () => {
    const ids = [add(), add()]; const batchId = randomUUID();
    await put(batchId, { revision: 2, articleIds: ids });
    expect((await put(batchId, { revision: 2, articleIds: [...ids].reverse() })).status).toBe(200);
    for (const body of [{ revision: 1, articleIds: ids }, { revision: 3, articleIds: ids }, { revision: 2, articleIds: [ids[0]] }]) {
      const response = await put(batchId, body);
      expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: 'BATCH_CONFLICT' });
    }
  });

  it.each([
    {}, [], { revision: 1 }, { revision: 0, articleIds: [] }, { revision: '1', articleIds: [] },
    { revision: 1.1, articleIds: [] }, { revision: 1, articleIds: [0] }, { revision: 1, articleIds: ['1'] },
    { revision: 1, articleIds: [1, 1] }, { revision: 1, articleIds: Array.from({ length: 11 }, (_, i) => i + 1) },
    { revision: 1, articleIds: [], history: [] }, { revision: 1, articleIds: [], skippedIds: [] },
  ])('不正な本文を400で拒否し結果を保存しない: %j', async (body) => {
    const response = await put(randomUUID(), body);
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: 'INVALID_SORTING_INPUT' });
    expect(database.db.select().from(articleInterestBatches).all()).toHaveLength(0);
  });

  it('不正な回IDと壊れたJSONを400で拒否する', async () => {
    expect((await fetch(url('bad'))).status).toBe(400);
    expect((await put('bad', { revision: 1, articleIds: [] })).status).toBe(400);
    const malformed = await fetch(url(randomUUID()), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(malformed.status).toBe(400);
  });

  it('予期しない失敗は500を返し、内部DB情報を公開しない', async () => {
    for (const method of ['getCandidates', 'getBatch', 'submit'] as const) {
      const spy = jest.spyOn(app.get(ArticleSortingService), method).mockImplementation((): never => { throw new Error('private DB details'); });
      try {
        const response = method === 'getCandidates' ? await fetch(`${base}/sorting/candidates`)
          : method === 'getBatch' ? await fetch(url(randomUUID())) : await put(randomUUID(), { revision: 1, articleIds: [] });
        expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain('private DB');
      } finally { spy.mockRestore(); }
    }
  });
});
