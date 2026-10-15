import type { CollectionSettings, SourceConfig } from '../models/source-config';
import { SettingsRepository } from './settings.repository';
import { SettingsService, defaultSettings } from './settings.service';
import { defaultSources } from './default-sources';

class MemorySettingsRepository extends SettingsRepository {
  readonly sources: SourceConfig[] = [];
  settings: CollectionSettings | undefined;

  transaction<T>(operation: () => T): T { return operation(); }
  listSources(): SourceConfig[] { return [...this.sources]; }
  saveSource(source: SourceConfig): void {
    const index = this.sources.findIndex((saved) => saved.sourceId === source.sourceId);
    if (index < 0) this.sources.push(source);
    else this.sources[index] = source;
  }
  getSettings(): CollectionSettings | undefined { return this.settings; }
  saveSettings(settings: CollectionSettings): void { this.settings = settings; }
}

describe('取得先と保持・収集設定の判断', () => {
  let repository: MemorySettingsRepository;
  let service: SettingsService;

  beforeEach(() => {
    repository = new MemorySettingsRepository();
    service = new SettingsService(repository);
  });

  it('初期設定を追加し、再実行しても利用者の設定を上書きしない', () => {
    service.initialize();
    expect(service.getSettings()).toEqual(defaultSettings);
    expect(service.listSources()).toHaveLength(5);
    service.saveSettings({ ...defaultSettings, maxArticles: 20000 });
    service.saveSource({ ...defaultSources[0]!, enabled: false });
    service.initialize();
    expect(service.getSettings().maxArticles).toBe(20000);
    expect(service.listSources()[0]?.enabled).toBe(false);
    expect(service.listSources()).toHaveLength(5);
  });

  it('同じ取得先URLを利用者が別IDで登録済みならデフォルトを重ねない', () => {
    service.saveSource({ ...defaultSources[0]!, sourceId: 'my-zenn' });
    service.initialize();
    expect(service.listSources()).toHaveLength(5);
    expect(service.listSources().some((source) => source.sourceId === 'zenn')).toBe(false);
  });

  it('不正な取得先は保存せずに拒否する', () => {
    const source = defaultSources[0]!;
    for (const invalid of [
      { ...source, sourceId: ' ' }, { ...source, siteName: '' },
      { ...source, endpoint: 'file:///tmp/feed' }, { ...source, endpoint: 'invalid' },
      { ...source, maxPerRun: 0 }, { ...source, maxPerRun: 1.5 },
      { ...source, adapterKind: 'unknown' as SourceConfig['adapterKind'] },
      { ...source, enabled: 1 as unknown as boolean },
    ]) {
      expect(() => service.saveSource(invalid)).toThrow();
    }
    expect(repository.sources).toHaveLength(0);
  });

  it('不正な保持・収集設定は保存せずに拒否する', () => {
    for (const invalid of [
      { ...defaultSettings, unreadRetentionDays: 0 }, { ...defaultSettings, maxArticles: 1.5 },
      { ...defaultSettings, collectionHour: 24 }, { ...defaultSettings, collectionHour: -1 },
      { ...defaultSettings, collectionTimezone: 'invalid/timezone' },
    ]) {
      expect(() => service.saveSettings(invalid)).toThrow();
    }
    expect(repository.settings).toBeUndefined();
  });

  it('初期化前の設定取得は未初期化として知らせる', () => {
    expect(() => service.getSettings()).toThrow('Settings are not initialized');
  });
});
