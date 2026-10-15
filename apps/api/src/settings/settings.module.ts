import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { SettingsRepository } from './application/settings.repository';
import { SettingsService } from './application/settings.service';
import { SqliteSettingsRepository } from './persistence/sqlite-settings.repository';

@Module({
  imports: [DatabaseModule],
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
