import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { ArticlePageResponse, ArticleSource } from '@it-discovery/contracts';
import { AppModule } from '../../../app.module';
import { ArticleService } from '../../services/article.service';
import { SettingsService } from '../../../settings/services/settings.service';

describe('取得先で絞り込む一覧HTTP API', () => {
  let app: INestApplication, directory: string, base: string;
  const original = process.env['DATABASE_PATH'];
  const ids: number[] = [], interests: number[] = [];
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'discovery-source-filter-'));
    process.env['DATABASE_PATH'] = join(directory, 'test.db');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1'); base = `${await app.getUrl()}/api`;
    const settings = app.get(SettingsService);
    settings.saveSource({ sourceId: 'paused', siteName: '停止中の取得先', endpoint: 'https://example.com/feed',
      iconUrl: null, enabled: false, adapterKind: 'rss-atom', maxPerRun: 10 });
    const service = app.get(ArticleService);
    for (let index = 0; index < 50; index++) {
      const sourceId = index % 2 === 0 ? 'zenn' : 'publickey';
      const item = service.register({ sourceId, title: `記事${index}`, url: `https://example.com/${index}` }, new Date('2026-10-01'));
      if (sourceId === 'zenn') {
        ids.unshift(item.article.articleId);
        if (index % 4 === 0) {
          service.updateState(item.article.articleId, { interested: true }); interests.unshift(item.article.articleId);
        }
      }
    }
  });
  afterAll(async () => {
    await app?.close(); if (directory) rmSync(directory, { recursive: true, force: true });
    if (original === undefined) delete process.env['DATABASE_PATH']; else process.env['DATABASE_PATH'] = original;
  });
  const page = async (query: string) => {
    const response = await fetch(`${base}/articles?${query}`); expect(response.status).toBe(200);
    return await response.json() as ArticlePageResponse;
  };
  it('SQLで絞り込み、同じ日時でも20件と5件に分けて重複・他取得先の混入なく終わる', async () => {
    const first = await page('sourceId=zenn');
    const last = await page(`sourceId=zenn&cursor=${first.nextCursor}`);
    expect(first.articles).toHaveLength(20); expect(last.articles).toHaveLength(5);
    expect([...first.articles, ...last.articles].map(item => item.articleId)).toEqual(ids);
    expect(last).toMatchObject({ nextCursor: null, hasMore: false });
  });
  it('気になると取得先を組み合わせ、指定しない一覧も維持する', async () => {
    const selected = await page('kind=interested&sourceId=zenn');
    expect(selected.articles.map(item => item.articleId)).toEqual(interests);
    const all = await page(''); expect(all.articles.some(item => item.source.sourceId === 'publickey')).toBe(true);
    expect(await page('sourceId=not-found')).toEqual({ articles: [], nextCursor: null, hasMore: false });
  });
  it('カーソルを別取得先・全取得先・別種類へ使い回せない', async () => {
    const selected = await page('sourceId=zenn&limit=1');
    for (const query of ['sourceId=publickey', '', 'sourceId=zenn&kind=interested']) {
      expect((await fetch(`${base}/articles?${query}&cursor=${selected.nextCursor}`)).status).toBe(400);
    }
    const all = await page('limit=1');
    expect((await fetch(`${base}/articles?sourceId=zenn&cursor=${all.nextCursor}`)).status).toBe(400);
  });
  it.each(['sourceId=', 'sourceId=zenn&sourceId=paused', 'sourceId=%20zenn', 'sourceId=zenn%00', `sourceId=${'a'.repeat(101)}`])('不正な条件%sを拒否', async query => {
    expect((await fetch(`${base}/articles?${query}`)).status).toBe(400);
  });
  it('現在の20件や収集の有効無効に依存せず、取得先の表示情報だけを返す', async () => {
    const response = await fetch(`${base}/sources`); expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const sources = await response.json() as ArticleSource[];
    expect(sources).toContainEqual({ sourceId: 'paused', siteName: '停止中の取得先', iconUrl: null });
    expect(sources).toContainEqual({ sourceId: 'gihyo', siteName: 'gihyo.jp', iconUrl: null });
    expect(sources.every(source => Object.keys(source).sort().join(',') === 'iconUrl,siteName,sourceId')).toBe(true);
  });
});
