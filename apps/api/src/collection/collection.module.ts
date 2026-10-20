import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ArticlesModule } from '../articles/articles.module';
import { SettingsModule } from '../settings/settings.module';
import { SourceAdapters } from './adapters/source-adapters';
import { CollectionJob } from './services/collection-job.service';
import { CollectionSchedule } from './services/collection-schedule.service';

@Module({
  // forRootはここだけ。UIのリクエストから収集を開始するControllerは設けない。
  imports: [ScheduleModule.forRoot(), ArticlesModule, SettingsModule],
  providers: [CollectionJob, CollectionSchedule, { provide: SourceAdapters, useFactory: () => new SourceAdapters() }],
  exports: [CollectionJob],
})
export class CollectionModule {}
