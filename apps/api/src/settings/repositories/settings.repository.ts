import type { CollectionSettings, SourceConfig } from '../models/source-config';

export abstract class SettingsRepository {
  // 同期処理を一括確定し、例外時は全て取り消す。
  abstract transaction<T>(operation: () => T): T;
  // 全ての取得先設定を取得する。
  abstract listSources(): SourceConfig[];
  // 取得先設定を追加・変更する。
  abstract saveSource(source: SourceConfig): void;
  // 保持と収集の設定を取得する。
  abstract getSettings(): CollectionSettings | undefined;
  // 保持と収集の設定を保存する。
  abstract saveSettings(settings: CollectionSettings): void;
}
