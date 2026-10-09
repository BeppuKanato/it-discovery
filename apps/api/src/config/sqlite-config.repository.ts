import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { appSettings, sources } from '../database/schema';
import type { CollectionSettings, SourceConfig } from './source-config';

@Injectable()
export class SqliteConfigRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // 全ての取得先設定を取得する。
  listSources(): SourceConfig[] {
    return this.database.db.select().from(sources).orderBy(sources.sourceId).all();
  }

  // 取得先設定を追加・変更する。
  saveSource(source: SourceConfig): void {
    if (!source.sourceId.trim() || !source.siteName.trim()) throw new Error('Source name and ID are required');
    const endpoint = new URL(source.endpoint);
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Source must use HTTP(S)');
    if (!Number.isSafeInteger(source.maxPerRun) || source.maxPerRun <= 0) throw new Error('Invalid maxPerRun');
    this.database.db.insert(sources).values(source)
      .onConflictDoUpdate({ target: sources.sourceId, set: source }).run();
  }

  // 未登録のデフォルト取得先だけを追加する。
  addDefaults(defaults: SourceConfig[]): void {
    this.database.db.transaction((tx) => {
      for (const source of defaults) tx.insert(sources).values(source).onConflictDoNothing().run();
    });
  }

  // 保持と収集の設定を取得する。
  getSettings(): CollectionSettings {
    const { id: _id, ...settings } = this.database.db.select().from(appSettings)
      .where(eq(appSettings.id, 1)).get()!;
    return settings;
  }

  // 保持と収集の設定を保存する。
  saveSettings(settings: CollectionSettings): void {
    for (const value of [settings.unreadRetentionDays, settings.maxArticles]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid retention settings');
    }
    if (!Number.isInteger(settings.collectionHour) || settings.collectionHour < 0 || settings.collectionHour > 23) {
      throw new Error('Invalid collection hour');
    }
    new Intl.DateTimeFormat('en', { timeZone: settings.collectionTimezone });
    this.database.db.update(appSettings).set(settings).where(eq(appSettings.id, 1)).run();
  }
}
