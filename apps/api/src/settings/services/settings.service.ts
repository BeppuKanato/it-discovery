import { Inject, Injectable } from '@nestjs/common';
import type { CollectionSettings, SourceConfig } from '../models/source-config';
import { SettingsRepository } from '../repositories/settings.repository';
import { defaultSources } from '../models/default-sources';

export const defaultSettings: CollectionSettings = {
  unreadRetentionDays: 30,
  maxArticles: 10000,
  collectionHour: 5,
  collectionTimezone: 'Asia/Tokyo',
};

@Injectable()
export class SettingsService {
  constructor(@Inject(SettingsRepository) private readonly repository: SettingsRepository) {}

  // 未登録の初期設定と取得先を追加する。
  initialize(): void {
    this.repository.transaction(() => {
      if (!this.repository.getSettings()) this.saveSettings(defaultSettings);
      const existing = this.repository.listSources();
      for (const source of defaultSources) {
        if (!existing.some((saved) => saved.sourceId === source.sourceId || saved.endpoint === source.endpoint)) {
          this.saveSource(source);
        }
      }
    });
  }

  // 全ての取得先設定を取得する。
  listSources(): SourceConfig[] {
    return this.repository.listSources();
  }

  // 取得先の入力を検証して保存する。
  saveSource(source: SourceConfig): void {
    if (!source.sourceId.trim() || !source.siteName.trim()) throw new Error('Source name and ID are required');
    const endpoint = new URL(source.endpoint);
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Source must use HTTP(S)');
    if (!Number.isSafeInteger(source.maxPerRun) || source.maxPerRun <= 0) throw new Error('Invalid maxPerRun');
    if (!['rss-atom', 'github-releases'].includes(source.adapterKind)) throw new Error('Invalid adapterKind');
    if (typeof source.enabled !== 'boolean') throw new Error('Invalid enabled');
    this.repository.saveSource(source);
  }

  // 保持と収集の設定を取得する。
  getSettings(): CollectionSettings {
    const settings = this.repository.getSettings();
    if (!settings) throw new Error('Settings are not initialized');
    return settings;
  }

  // 保持と収集の入力を検証して保存する。
  saveSettings(settings: CollectionSettings): void {
    for (const value of [settings.unreadRetentionDays, settings.maxArticles]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid retention settings');
    }
    if (!Number.isInteger(settings.collectionHour) || settings.collectionHour < 0 || settings.collectionHour > 23) {
      throw new Error('Invalid collection hour');
    }
    new Intl.DateTimeFormat('en', { timeZone: settings.collectionTimezone });
    this.repository.saveSettings(settings);
  }
}
