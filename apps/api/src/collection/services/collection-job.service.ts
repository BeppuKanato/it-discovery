import { Inject, Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';
import { SettingsService } from '../../settings/services/settings.service';
import { ArticleRetentionService } from '../../articles/services/article-retention.service';
import { SourceAdapters } from '../adapters/source-adapters';
import { SourceFetchError } from '../models/source-adapter';

export interface CollectionReport {
  status: 'completed' | 'overlap' | 'stopped';
  added: number; updated: number; capacity: number; removed: number; skippedItems: number; failedSources: number;
}

@Injectable()
export class CollectionJob implements BeforeApplicationShutdown {
  private readonly logger = new Logger(CollectionJob.name);
  private active: Promise<CollectionReport> | null = null;
  private stopping = false;
  constructor(
    @Inject(SettingsService) private readonly configs: SettingsService,
    @Inject(ArticleRetentionService) private readonly articles: ArticleRetentionService,
    @Inject(SourceAdapters) private readonly adapters: SourceAdapters,
  ) {}

  run(): Promise<CollectionReport> {
    if (this.stopping || this.active) {
      const status = this.stopping ? 'stopped' : 'overlap';
      this.logger.log({ event: 'collection_skipped', reason: status });
      return Promise.resolve(this.report(status));
    }
    this.active = this.collect().finally(() => { this.active = null; });
    return this.active;
  }

  private async collect(): Promise<CollectionReport> {
    const report = this.report('completed');
    try {
      const policy = this.configs.getSettings();
      const sources = this.configs.listSources().filter((source) => source.enabled);
      report.removed = this.articles.sweep(policy);
      for (const source of sources) {
        if (this.stopping) { report.status = 'stopped'; break; }
        let result;
        try { result = await this.adapters.fetch(source); }
        catch (error) {
          if (this.stopping) { report.status = 'stopped'; break; }
          if (!(error instanceof SourceFetchError)) throw error;
          report.failedSources++;
          this.logger.warn({ event: 'source_failed', sourceId: source.sourceId, reason: error.reason, status: error.status });
          continue;
        }
        if (this.stopping) { report.status = 'stopped'; break; }
        report.skippedItems += result.skippedItems;
        // awaitをtransactionへ持ち込まない。一件ごとに確定し、DB失敗なら残りの取得元へ進まない。
        for (const article of result.articles) report[this.articles.save(article, policy)]++;
        this.logger.log({ event: 'source_completed', sourceId: source.sourceId, articles: result.articles.length, skippedItems: result.skippedItems });
      }
      this.logger.log({ event: 'collection_completed', ...report });
      return report;
    } catch (error) {
      // DBエラーの生SQLや設定値を公開ログへ流さず、呼び出し元には失敗を返す。
      this.logger.error({ event: 'collection_failed', reason: 'storage_or_internal' });
      throw error;
    }
  }

  private report(status: CollectionReport['status']): CollectionReport {
    return { status, added: 0, updated: 0, capacity: 0, removed: 0, skippedItems: 0, failedSources: 0 };
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.adapters.close();
    // DBを閉じるonApplicationShutdownより前に、進行中の処理を終える。
    await this.active?.catch(() => {});
  }
}
