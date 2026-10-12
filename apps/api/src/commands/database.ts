import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { DatabaseService } from '../infrastructure/database/database.service';
import { SqliteSettingsRepository } from '../settings/persistence/sqlite-settings.repository';
import { SettingsService } from '../settings/application/settings.service';
import { defaultSources } from '../settings/application/default-sources';
import { SqliteArticleRepository } from '../articles/persistence/sqlite-article.repository';
import { ArticleService } from '../articles/application/article.service';

if (existsSync('.env')) loadEnvFile('.env');
const command = process.argv[2];
if (command !== 'migrate' && command !== 'seed') throw new Error('Expected migrate or seed');
const database = new DatabaseService();
try {
  const configs = new SettingsService(new SqliteSettingsRepository(database));
  configs.initialize();
  if (command === 'seed') {
    const service = new ArticleService(new SqliteArticleRepository(database));
    database.db.transaction(() => {
      for (const source of defaultSources) {
        service.register({
          sourceId: source.sourceId,
          externalArticleId: 'it-discovery-local-sample-1',
          url: `https://example.com/it-discovery-sample/${source.sourceId}`,
          title: `${source.siteName}の表示確認用サンプル`,
          description: '架空の文面です。本番収集ではなく、DBと一覧の開発確認に使います。',
        });
      }
    });
    console.log('架空のサンプル記事5件を追加・更新しました。');
  } else {
    console.log('マイグレーションと初期設定を適用しました。');
  }
} finally {
  database.onApplicationShutdown();
}
