import { Logger } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { SqliteSettingsRepository } from '../../settings/repositories/sqlite-settings.repository';
import { SettingsService } from '../../settings/services/settings.service';
import { SqliteArticleRepository } from '../../articles/repositories/sqlite-article.repository';
import { ArticleService } from '../../articles/services/article.service';
import { ArticleRetentionService } from '../../articles/services/article-retention.service';
import { SourceAdapters } from '../adapters/source-adapters';
import { SourceFetchError, type SourceResult } from '../models/source-adapter';
import { CollectionJob } from './collection-job.service';
import { CollectionSchedule } from './collection-schedule.service';
import { SchedulerRegistry } from '@nestjs/schedule';
const entry = (sourceId: string, id = 'article') => ({ sourceId, externalArticleId: id, title: 'article', url: `https://example.com/${id}` });

describe('収集ジョブと定刻の接続', () => {
  let database: DatabaseService;
  let configs: SettingsService;
  let articles: ArticleService;
  let retention: ArticleRetentionService;
  let adapters: SourceAdapters;
  let job: CollectionJob;
  const previous = process.env['DATABASE_PATH'];
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    process.env['DATABASE_PATH'] = ':memory:';
    database = new DatabaseService();
    configs = new SettingsService(new SqliteSettingsRepository(database));
    configs.initialize();
    articles = new ArticleService(new SqliteArticleRepository(database));
    retention = new ArticleRetentionService(new SqliteArticleRepository(database), articles);
    adapters = new SourceAdapters();
    job = new CollectionJob(configs, retention, adapters);
  });
  afterEach(async () => {
    await job.beforeApplicationShutdown();
    database.onApplicationShutdown();
    jest.restoreAllMocks();
    if (previous === undefined) delete process.env['DATABASE_PATH'];
    else process.env['DATABASE_PATH'] = previous;
  });

  it('情報源の失敗後も続け、既存内容と状態を守り、無効な取得先を呼ばない', async () => {
    const sources = configs.listSources();
    configs.saveSource({ ...sources[3]!, enabled: false });
    const existing = articles.register(entry(sources[0]!.sourceId));
    articles.updateState(existing.article.articleId, { pinned: true });
    const transport = jest.spyOn(adapters, 'fetch').mockImplementation(async (source) => {
      if (source.sourceId === sources[1]!.sourceId) throw new SourceFetchError('http', 500);
      return { articles: [{ ...entry(source.sourceId), title: 'updated' }], skippedItems: 1 };
    });
    await expect(job.run()).resolves.toMatchObject({ status: 'completed', updated: 1, added: 1, failedSources: 1, skippedItems: 2 });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(articles.findById(existing.article.articleId)).toMatchObject({ article: { title: 'updated' }, state: { pinned: true } });
  });

  it('DB失敗はその実行を終了し、先に確定済みの記事を残す', async () => {
    jest.spyOn(adapters, 'fetch').mockImplementation(async (source) => ({ articles: [entry(source.sourceId)], skippedItems: 0 }));
    const save = retention.save.bind(retention);
    jest.spyOn(retention, 'save').mockImplementationOnce(save).mockImplementationOnce(() => { throw Error('storage failure'); });
    await expect(job.run()).rejects.toThrow('storage failure');
    expect(adapters.fetch).toHaveBeenCalledTimes(2);
    expect(database.client.prepare('SELECT count(*) AS n FROM articles').get()).toEqual({ n: 1 });
  });

  it('重複実行を待ち行列にせずスキップする', async () => {
    let resolve!: (result: SourceResult) => void;
    jest.spyOn(adapters, 'fetch').mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
      .mockResolvedValue({ articles: [], skippedItems: 0 });
    const first = job.run();
    await expect(job.run()).resolves.toMatchObject({ status: 'overlap' });
    resolve({ articles: [], skippedItems: 0 });
    await first;
    await expect(job.run()).resolves.toMatchObject({ status: 'completed' });
  });

  it('保護だけで上限でも既存を更新し、保護解除後の収集で再開する', async () => {
    const source = configs.listSources()[0]!;
    for (const other of configs.listSources().slice(1)) configs.saveSource({ ...other, enabled: false });
    configs.saveSettings({ ...configs.getSettings(), maxArticles: 1 });
    const existing = articles.register(entry(source.sourceId));
    articles.updateState(existing.article.articleId, { interested: true });
    jest.spyOn(adapters, 'fetch').mockResolvedValue({ articles: [entry(source.sourceId), entry(source.sourceId, 'new')], skippedItems: 0 });
    await expect(job.run()).resolves.toMatchObject({ updated: 1, capacity: 1 });
    articles.updateState(existing.article.articleId, { interested: false });
    await expect(job.run()).resolves.toMatchObject({ updated: 1, added: 1, capacity: 0 });
  });

  it('日本時間の朝5時を予約し、画面を開かずにジョブを呼ぶ', async () => {
    const registry = new SchedulerRegistry();
    const run = jest.spyOn(job, 'run').mockResolvedValue({ status: 'completed', added: 0, updated: 0, capacity: 0, removed: 0, skippedItems: 0, failedSources: 0 });
    new CollectionSchedule(configs, job, registry).onApplicationBootstrap();
    const cron = registry.getCronJob('article-collection');
    try {
      expect(cron.nextDate().setZone('Asia/Tokyo').toFormat('HH:mm:ss')).toBe('05:00:00');
      await cron.fireOnTick();
      expect(run).toHaveBeenCalledTimes(1);
    } finally { registry.deleteCronJob('article-collection'); }
  });

  it('終了開始後は新しい収集を拒否する', async () => {
    await job.beforeApplicationShutdown();
    await expect(job.run()).resolves.toMatchObject({ status: 'stopped' });
  });
});
