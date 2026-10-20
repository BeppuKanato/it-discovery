// 一時DB・架空記事・fake-indexeddbだけを使う。HTTPは実際のNest/SQLiteへ通す。
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import type { SourceConfig } from '../apps/api/src/settings/models/source-config.ts';
import type { SettingsService as SettingsServiceType } from '../apps/api/src/settings/services/settings.service.ts';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiClient } from '../apps/web/src/infrastructure/api/api-client.ts';
import { ArticleListModel } from '../apps/web/src/features/list/models/article-list.model.ts';
import { ArticleStateModel } from '../apps/web/src/features/articles/models/article-state.model.ts';
import { ArticleOpeningModel } from '../apps/web/src/features/articles/models/article-opening.model.ts';
import { SortingModel } from '../apps/web/src/features/sorting/models/sorting.model.ts';
import { SortingSession } from '../apps/web/src/features/sorting/models/sorting-session.ts';
import { PendingInterestModel } from '../apps/web/src/features/sorting/models/pending-interest.model.ts';
import { InterestBatchSyncModel } from '../apps/web/src/features/sorting/models/interest-batch-sync.model.ts';
import { ApplicationStartupModel } from '../apps/web/src/features/startup/models/application-startup.model.ts';
import { IndexedDBPendingInterestStore } from '../apps/web/src/infrastructure/storage/indexeddb-pending-interest.store.ts';

// NestのESM/CJSを混在させてDIトークンを二重生成しないよう、バックは本番distから統一して読む。
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module.js');
const { SettingsService } = require('../apps/api/dist/settings/services/settings.service.js');
const { CollectionJob } = require('../apps/api/dist/collection/services/collection-job.service.js');
const { SourceAdapters } = require('../apps/api/dist/collection/adapters/source-adapters.js');
const { RssAtomAdapter } = require('../apps/api/dist/collection/adapters/rss-atom.adapter.js');
const { ArticleRetentionService } = require('../apps/api/dist/articles/services/article-retention.service.js');
const directory = mkdtempSync(join(tmpdir(), 'it-discovery-integration-'));
const previousPath = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = join(directory, 'articles.db');
const xml = '<rss version="2.0"><channel>' + Array.from({ length: 25 }, (_, i) =>
  `<item><guid>sample-${i}</guid><title>架空記事${i}</title><link>https://example.com/article/${i}</link></item>`).join('') + '</channel></rss>';
let app: INestApplication | null;
const storeName = `integration-${crypto.randomUUID()}`;
let store = new IndexedDBPendingInterestStore(storeName);
async function boot(): Promise<INestApplication> {
  const server = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  server.get(SourceAdapters).fetch = (source: SourceConfig) => new RssAtomAdapter().parse(source, xml);
  server.setGlobalPrefix('api');
  await server.listen(0, '127.0.0.1');
  return server;
}
try {
  app = await boot();
  const settings = app.get<SettingsServiceType>(SettingsService);
  for (const source of settings.listSources()) settings.saveSource({ ...source, enabled: source.sourceId === 'zenn' });
  assert.equal((await app.get(CollectionJob).run()).added, 25);
  assert.equal((await app.get(CollectionJob).run()).updated, 25);
  let api = new ApiClient(`${await app.getUrl()}/api`);
  const list = new ArticleListModel(api);
  const first = await list.getPage('all');
  assert.equal(first.articles.length, 20);
  assert.ok(first.nextCursor);
  const rest = await list.getPage('all', first.nextCursor);
  assert.equal(rest.articles.length, 5);
  assert.equal(rest.hasMore, false);
  assert.equal(new Set([...first.articles, ...rest.articles].map(a => a.articleId)).size, 25);

  const candidates = (await new SortingModel(api).getCandidates()).articles;
  assert.equal(candidates.length, 10);
  const session = SortingSession.start(candidates).decide('interested').decide('interested').undo().decide('skipped');
  assert.deepEqual(session.interestedIds, [candidates[0]!.articleId]);
  const pending = new PendingInterestModel(store);
  await pending.update(session.interestedIds);
  await pending.flush();
  await store.close();
  // 新しい接続で前回の端末記録を復元し、通常の一覧操作より前に送信を終える。
  store = new IndexedDBPendingInterestStore(storeName);
  const sync = new InterestBatchSyncModel(store, api);
  const startup = new ApplicationStartupModel({ acquire: async () => true, release() {} }, store, sync, new SortingModel(api), () => new Date('2026-10-20T00:00:00Z'));
  assert.equal(await startup.acquireLease(), true);
  for (const batch of await startup.restorePending()) {
    const result = await startup.send(batch);
    assert.ok(result.results.every(row => row.status === 'saved'));
    await startup.acknowledge(batch);
  }
  assert.equal((await store.loadAll()).length, 0);
  let state = new ArticleStateModel(api);
  assert.equal((await state.getState(candidates[0]!.articleId)).interested, true);
  assert.equal((await state.getState(candidates[1]!.articleId)).interested, false);
  assert.ok((await startup.checkDaily()).articles.length);
  assert.equal((await startup.checkDaily()).articles.length, 0);

  // 保存後に返事だけ失われた場合、再起動後は結果GETで確認し、同じPUTを繰り返さない。
  const lost = new PendingInterestModel(store);
  await lost.update([candidates[2]!.articleId]);
  const batch = (await lost.flush())!;
  const lossy = new InterestBatchSyncModel(store, {
    getInterestBatchResult: (...args) => api.getInterestBatchResult(...args),
    saveInterestBatch: async (...args) => { await api.saveInterestBatch(...args); throw Error('response lost'); },
  });
  await assert.rejects(lossy.send(batch), /response lost/);
  assert.equal((await store.loadAll()).length, 1);
  await app.close(); app = null;
  app = await boot();
  api = new ApiClient(`${await app.getUrl()}/api`);
  let repeatedPut = false;
  const recovered = new InterestBatchSyncModel(store, {
    getInterestBatchResult: (...args) => api.getInterestBatchResult(...args),
    saveInterestBatch: async (...args) => { repeatedPut = true; return api.saveInterestBatch(...args); },
  });
  await recovered.send(batch);
  await recovered.acknowledge(batch);
  assert.equal(repeatedPut, false);
  state = new ArticleStateModel(api);
  const id = candidates[0]!.articleId;
  assert.equal((await state.setField(id, 'pinned', true)).pinned, true);
  assert.equal((await state.setField(id, 'interested', false)).interested, false);
  let openedUrl = '';
  const openedAt = new ArticleOpeningModel({ open(url) { openedUrl = url; } }).open(candidates[0]!.url);
  assert.equal(openedUrl, candidates[0]!.url);
  await state.recordOpened(id, openedAt);
  assert.equal((await state.getState(id)).lastOpenedAt, openedAt);
  await app.close(); app = null;
  app = await boot();
  api = new ApiClient(`${await app.getUrl()}/api`);
  state = new ArticleStateModel(api);
  assert.deepEqual(await state.getState(id), { interested: false, pinned: true, lastOpenedAt: openedAt });
  const retention = app.get(ArticleRetentionService);
  retention.sweep({ unreadRetentionDays: 30, maxArticles: 2 });
  assert.equal((await new ArticleListModel(api).getPage('all')).articles.length, 2);
  assert.equal((await state.getState(id)).pinned, true);
  assert.equal((await state.getState(candidates[2]!.articleId)).interested, true);
  console.log('PASS: collection → pagination → sorting/undo → terminal recovery → lost-response recovery → pin/unregister/open/read → DB restart → retention');
} finally {
  await store.close();
  await app?.close();
  rmSync(directory, { recursive: true, force: true });
  if (previousPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previousPath;
}
