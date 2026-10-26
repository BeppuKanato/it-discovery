import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { SettingsRepository } from './repositories/settings.repository';
import { SettingsService } from './services/settings.service';
import { SqliteSettingsRepository } from './repositories/sqlite-settings.repository';
import { SourcesController } from './controllers/sources.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [SourcesController],
  providers: [SettingsService, { provide: SettingsRepository, useClass: SqliteSettingsRepository }],
  exports: [SettingsService],
})
export class SettingsModule implements OnModuleInit {
  constructor(@Inject(SettingsService) private readonly configs: SettingsService) {}

  // 未登録の初期設定と取得先を初期化する。
  onModuleInit(): void {
    this.configs.initialize();
  }
}
