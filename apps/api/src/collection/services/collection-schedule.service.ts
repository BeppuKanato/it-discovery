import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SettingsService } from '../../settings/services/settings.service';
import { CollectionJob } from './collection-job.service';

@Injectable()
export class CollectionSchedule implements OnApplicationBootstrap {
  private readonly logger = new Logger(CollectionSchedule.name);
  constructor(
    @Inject(SettingsService) private readonly configs: SettingsService,
    @Inject(CollectionJob) private readonly collection: CollectionJob,
    @Inject(SchedulerRegistry) private readonly registry: SchedulerRegistry,
  ) {}
  onApplicationBootstrap(): void {
    // SettingsModuleの初期化後にDBの時刻・タイムゾーンから組み立てる。変更時はAPIを再起動する。
    const settings = this.configs.getSettings();
    const job = CronJob.from({
      cronTime: `0 0 ${settings.collectionHour} * * *`,
      timeZone: settings.collectionTimezone,
      waitForCompletion: true,
      onTick: async () => {
        try { await this.collection.run(); }
        catch { /* CollectionJobが記録済み。次回の定刻まで待ち、即時の自動再試行はしない。 */ }
      },
    });
    this.registry.addCronJob('article-collection', job);
    job.start();
    this.logger.log({ event: 'collection_scheduled', hour: settings.collectionHour, timezone: settings.collectionTimezone });
  }
}
