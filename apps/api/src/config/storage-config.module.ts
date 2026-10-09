import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { defaultSources } from './default-sources';
import { SqliteConfigRepository } from './sqlite-config.repository';

@Module({
  imports: [DatabaseModule],
  providers: [SqliteConfigRepository],
  exports: [SqliteConfigRepository],
})
export class StorageConfigModule implements OnModuleInit {
  constructor(@Inject(SqliteConfigRepository) private readonly configs: SqliteConfigRepository) {}

  // 未登録のデフォルト取得先を初期化する。
  onModuleInit(): void {
    this.configs.addDefaults(defaultSources);
  }
}
