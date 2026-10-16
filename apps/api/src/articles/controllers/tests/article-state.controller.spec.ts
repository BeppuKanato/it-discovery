import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { AppModule } from '../../../app.module';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { articles, articleStateOperations } from '../../../infrastructure/database/schema';
import { ArticleService } from '../../services/article.service';
import { ArticleStateService } from '../../services/article-state.service';
import type { ArticleStateOperationResponse, ArticleStateResponse } from '@it-discovery/contracts';

describe('記事状態と操作結果のHTTP API', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let directory: string;
  let base: string;
  let articleId: number;
  let stateUrl: string;
  const oldPath = process.env['DATABASE_PATH'];
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'it-discovery-state-http-'));
    process.env['DATABASE_PATH'] = join(directory, 'test.db');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api`;
    database = app.get(DatabaseService);
  }, 30000);
  beforeEach(() => {
    articleId = app.get(ArticleService).register({ sourceId: 'zenn',
      url: `https://example.com/${randomUUID()}`, title: '記事' }).article.articleId;
    stateUrl = `${base}/articles/${articleId}/state`;
  });
  afterAll(async () => {
    await app?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env['DATABASE_PATH']; else process.env['DATABASE_PATH'] = oldPath;
  });
  const put = (body: unknown, url?: string) => fetch(url ?? stateUrl, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const mutation = (value: boolean, kind = 'interested', operationId = randomUUID()) => ({ operationId, change: { kind, value } });

  it('初期状態を取得し、明示した登録・ピンだけを変更する', async () => {
    const response = await fetch(stateUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ articleId, state: { interested: false, pinned: false, lastOpenedAt: null } });
    const interested = mutation(true);
    const saved = await put(interested);
    expect(saved.status).toBe(200);
    expect(saved.headers.get('cache-control')).toBe('no-store');
    expect(await saved.json()).toEqual({ operationId: interested.operationId, articleId, status: 'saved',
      state: { interested: true, pinned: false, lastOpenedAt: null } });
    await put(mutation(true, 'pinned')); await put(mutation(false));
    expect(await fetch(stateUrl).then((r) => r.json())).toEqual({ articleId,
      state: { interested: false, pinned: true, lastOpenedAt: null } });
  });

  it('古い要求の応答を失っても、結果照会と再送で後の解除を巻き戻さない', async () => {
    const input = mutation(true);
    const first = await put(input).then((r) => r.json()) as ArticleStateOperationResponse;
    await put(mutation(false));
    const operation = await fetch(`${base}/article-state-operations/${input.operationId}`);
    expect(operation.status).toBe(200);
    expect(operation.headers.get('cache-control')).toBe('no-store');
    expect(await operation.json()).toEqual(first);
    expect(await put(input).then((r) => r.json())).toEqual(first);
    expect((await fetch(stateUrl).then((r) => r.json()) as ArticleStateResponse).state.interested).toBe(false);
  });

  it('既読を記録し、同時・逆順の日時でも最後に開いた日時を巻き戻さない', async () => {
    await put(mutation(true)); await put(mutation(true, 'pinned'));
    await Promise.all(['2026-10-16T12:00:00.000Z', '2026-10-15T12:00:00.000Z'].map((openedAt) =>
      put({ operationId: randomUUID(), change: { kind: 'opened', openedAt } })));
    expect((await fetch(stateUrl).then((r) => r.json()) as ArticleStateResponse).state)
      .toEqual({ interested: true, pinned: true, lastOpenedAt: '2026-10-16T12:00:00.000Z' });
  });

  it('同じ要求が同時に複数届いても、結果を一件だけ記録する', async () => {
    const input = mutation(true);
    const responses = await Promise.all([put(input), put(input), put(input)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    expect(database.db.select().from(articleStateOperations).where(eq(articleStateOperations.operationId, input.operationId)).all()).toHaveLength(1);
  });

  it('記事なしと結果未記録を区別し、missingの再送も同じ確定結果を返す', async () => {
    database.db.delete(articles).where(eq(articles.articleId, articleId)).run();
    const state = await fetch(stateUrl);
    expect(state.status).toBe(404);
    expect(await state.json()).toMatchObject({ code: 'ARTICLE_NOT_FOUND' });
    const input = mutation(true);
    const before = await fetch(`${base}/article-state-operations/${input.operationId}`);
    expect(before.status).toBe(404);
    expect(await before.json()).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    const result = { operationId: input.operationId, articleId, status: 'missing', state: null };
    const response = await put(input);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(await put(input).then((r) => r.json())).toEqual(result);
    expect(await fetch(`${base}/article-state-operations/${input.operationId}`).then((r) => r.json())).toEqual(result);
  });

  it('同じ操作IDで値・項目・記事が違うと409を返す', async () => {
    const input = mutation(true);
    await put(input);
    for (const [body, url] of [
      [mutation(false, 'interested', input.operationId), stateUrl],
      [mutation(true, 'pinned', input.operationId), stateUrl],
      [input, `${base}/articles/${articleId + 1}/state`],
    ] as const) {
      const response = await put(body, url);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'OPERATION_CONFLICT' });
    }
  });

  it.each([
    {}, [], { operationId: 'bad', change: { kind: 'pinned', value: true } },
    mutation('true' as unknown as boolean),
    { operationId: randomUUID(), change: { kind: 'opened', openedAt: null } },
    { operationId: randomUUID(), change: { kind: 'opened', openedAt: '2026-02-30T00:00:00.000Z' } },
    { operationId: randomUUID(), change: { kind: 'unread' } },
    { ...mutation(true), extra: true },
    { operationId: randomUUID(), change: { kind: 'pinned', value: true, extra: true } },
  ])('不正な本文を400と専用コードで拒否する: %j', async (input) => {
    const response = await put(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_STATE_INPUT' });
    expect(database.db.select().from(articleStateOperations).where(eq(articleStateOperations.articleId, articleId)).all()).toEqual([]);
  });

  it.each(['0', '-1', '01', '1.5', '1e2', 'NaN', '9007199254740992', '1abc'])('不正な記事ID %s を拒否する', async (id) => {
    expect((await put(mutation(true), `${base}/articles/${id}/state`)).status).toBe(400);
    expect((await fetch(`${base}/articles/${id}/state`)).status).toBe(400);
  });

  it('不正な照会IDと壊れたJSONを拒否する', async () => {
    const operation = await fetch(`${base}/article-state-operations/bad`);
    expect(operation.status).toBe(400);
    expect(await operation.json()).toMatchObject({ code: 'INVALID_STATE_INPUT' });
    const malformed = await fetch(stateUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(malformed.status).toBe(400);
  });

  it('予期しない保存失敗は500にし、DBの詳細を漏らさない', async () => {
    const spy = jest.spyOn(app.get(ArticleStateService), 'apply').mockImplementation(() => { throw new Error('private SQL details'); });
    try {
      const response = await put(mutation(true));
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain('private SQL');
    } finally { spy.mockRestore(); }
  });
});
