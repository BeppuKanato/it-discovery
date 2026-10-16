import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ArticlePageResponse } from '@it-discovery/contracts';
import { AppModule } from '../../../app.module';
import { ArticleService } from '../../services/article.service';

describe('記事一覧のHTTP API', () => {
  let directory: string;
  let app: INestApplication;
  let service: ArticleService;
  let baseUrl: string;
  const oldPath = process.env['DATABASE_PATH'];
  const fetchedAt = new Date('2026-10-01T00:00:00Z');
  const expectedIds: number[] = [];
  const interestedIds: number[] = [];

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'it-discovery-http-'));
    process.env['DATABASE_PATH'] = join(directory, 'test.db');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api/articles`;
    service = app.get(ArticleService);
    for (let index = 0; index < 43; index++) {
      const saved = service.register({
        sourceId: 'zenn', externalArticleId: `article-${index}`,
        url: `https://example.com/${index}`, title: `記事${index}`,
        publishedAt: fetchedAt, sourceUpdatedAt: fetchedAt,
      }, fetchedAt);
      expectedIds.unshift(saved.article.articleId);
      if (index % 2 === 0) {
        service.updateState(saved.article.articleId, { interested: true, pinned: true, lastOpenedAt: fetchedAt });
        interestedIds.unshift(saved.article.articleId);
      }
    }
  }, 30000);

  afterAll(async () => {
    await app?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env['DATABASE_PATH'];
    else process.env['DATABASE_PATH'] = oldPath;
  });

  it('既定20件で全ページを取得し、重複なしで終了する', async () => {
    const actual: number[] = [];
    let cursor: string | null = null;
    for (const [index, size] of [20, 20, 3].entries()) {
      const response = await fetch(cursor ? `${baseUrl}?cursor=${cursor}` : baseUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const page = await response.json() as ArticlePageResponse;
      expect(page.articles).toHaveLength(size);
      expect(page.hasMore).toBe(index < 2);
      expect(typeof page.nextCursor === 'string').toBe(page.hasMore);
      actual.push(...page.articles.map((article) => article.articleId));
      cursor = page.nextCursor;
    }
    expect(cursor).toBeNull();
    expect(actual).toEqual(expectedIds);
  });

  it('気になる一覧は登録済みだけを返し、既読とピンの状態も対応する', async () => {
    const first = await fetch(`${baseUrl}?kind=interested`).then((response) => response.json()) as ArticlePageResponse;
    const last = await fetch(`${baseUrl}?kind=interested&cursor=${first.nextCursor}`)
      .then((response) => response.json()) as ArticlePageResponse;
    expect([...first.articles, ...last.articles].map((article) => article.articleId)).toEqual(interestedIds);
    expect(first.articles.every((article) => article.state.interested && article.state.pinned
      && article.state.lastOpenedAt === fetchedAt.toISOString())).toBe(true);
    expect(last).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it('日時をISO文字列にし、任意項目をnullにして表示用情報だけ返す', async () => {
    const page = await fetch(`${baseUrl}?limit=1`).then((response) => response.json()) as ArticlePageResponse;
    const article = page.articles[0]!;
    expect(article).toMatchObject({
      fetchedAt: fetchedAt.toISOString(), publishedAt: fetchedAt.toISOString(), sourceUpdatedAt: fetchedAt.toISOString(),
      description: null, author: null, source: { sourceId: 'zenn', siteName: 'Zenn', iconUrl: null },
    });
    expect(Object.keys(article).sort()).toEqual([
      'articleId', 'url', 'title', 'description', 'author', 'fetchedAt', 'publishedAt', 'sourceUpdatedAt', 'source', 'state',
    ].sort());
    expect(Object.keys(article.source).sort()).toEqual(['sourceId', 'siteName', 'iconUrl'].sort());
    expect(Object.keys(article.state).sort()).toEqual(['interested', 'pinned', 'lastOpenedAt'].sort());
  });

  it.each([
    'limit=0', 'limit=21', 'limit=-1', 'limit=1.5', 'limit=2e1', 'limit=01', 'limit=',
    'limit=NaN', 'limit=9007199254740993', 'limit=1&limit=2',
    'kind=unknown', 'kind=', 'kind=all&kind=interested', 'offset=20',
    'cursor=', 'cursor=not-a-cursor', 'cursor=%3D', 'cursor=a&cursor=b',
  ])('不正な入力 %s を400で知らせる', async (query) => {
    const response = await fetch(`${baseUrl}?${query}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ statusCode: 400, error: 'Bad Request', message: expect.any(String) });
  });

  it('別種類の一覧のカーソルと壊れたカーソルを拒否する', async () => {
    const page = await fetch(`${baseUrl}?limit=1`).then((response) => response.json()) as ArticlePageResponse;
    expect((await fetch(`${baseUrl}?kind=interested&cursor=${page.nextCursor}`)).status).toBe(400);
    const tokens = [
      Buffer.from('null').toString('base64url'),
      Buffer.from('[]').toString('base64url'),
      Buffer.from(JSON.stringify({ kind: 'all', fetchedAt: 0, articleId: 0 })).toString('base64url'),
      Buffer.from(JSON.stringify({ kind: 'all', fetchedAt: 0.5, articleId: 1 })).toString('base64url'),
      Buffer.from(JSON.stringify({ kind: 'all', fetchedAt: 8640000000000001, articleId: 1 })).toString('base64url'),
      Buffer.from(JSON.stringify({ kind: 'all', fetchedAt: 0, articleId: 9007199254740992 })).toString('base64url'),
      Buffer.from(JSON.stringify({ kind: 'all', fetchedAt: 0, articleId: 1, extra: true })).toString('base64url'),
      'a'.repeat(513),
    ];
    for (const cursor of tokens) expect((await fetch(`${baseUrl}?cursor=${cursor}`)).status).toBe(400);
  });

  it('存在しない古い位置の後ろは200と空一覧を返す', async () => {
    const cursor = Buffer.from(JSON.stringify({ kind: 'all', fetchedAt: 0, articleId: 1 })).toString('base64url');
    const response = await fetch(`${baseUrl}?cursor=${cursor}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ articles: [], nextCursor: null, hasMore: false });
  });

  it('DB側の失敗を入力エラーとして扱わず、詳細をHTTP応答へ漏らさない', async () => {
    const spy = jest.spyOn(service, 'getPage').mockImplementation(() => { throw new Error('private database details'); });
    try {
      const response = await fetch(baseUrl);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
      expect(JSON.stringify(body)).not.toContain('private database details');
    } finally {
      spy.mockRestore();
    }
  });
});
