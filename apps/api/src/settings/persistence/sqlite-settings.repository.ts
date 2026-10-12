import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { appSettings, sources } from '../../database/schema';
import type { CollectionSettings, SourceConfig } from '../models/source-config';
import { SettingsRepository } from '../application/settings.repository';

@Injectable()
export class SqliteSettingsRepository extends SettingsRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    super();
  }

  // 同期処理をSQLiteのトランザクションで一括確定する。
  transaction<T>(operation: () => T): T {
    return this.database.client.transaction(operation).immediate();
  }

  // 全ての取得先設定を取得する。
  listSources(): SourceConfig[] {
    return this.database.db.select().from(sources).orderBy(sources.sourceId).all();
  }

  // 渡された取得先設定を保存する。
  saveSource(source: SourceConfig): void {
    this.database.db.insert(sources).values(source)
      .onConflictDoUpdate({ target: sources.sourceId, set: source }).run();
  }

  // 保持と収集の設定をアプリの形式で取得する。
  getSettings(): CollectionSettings | undefined {
    const row = this.database.db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
    if (!row) return undefined;
    const { id: _id, ...settings } = row;
    return settings;
  }

  // 渡された保持と収集の設定を保存する。
  saveSettings(settings: CollectionSettings): void {
    this.database.db.insert(appSettings).values({ id: 1, ...settings })
      .onConflictDoUpdate({ target: appSettings.id, set: settings }).run();
  }
}
