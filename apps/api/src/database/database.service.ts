import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { resolveDatabasePath } from './database-path';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: Database.Database;
  readonly db;

  constructor() {
    const filename = resolveDatabasePath();
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.client = new Database(filename, { timeout: 5000 });
    try {
      this.client.pragma('foreign_keys = ON');
      this.client.pragma('journal_mode = WAL');
      this.db = drizzle(this.client, { schema });
      migrate(this.db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
      this.db.insert(schema.appSettings).values({
        id: 1, unreadRetentionDays: 30, maxArticles: 10000,
        collectionHour: 5, collectionTimezone: 'Asia/Tokyo',
      }).onConflictDoNothing().run();
    } catch (error) {
      this.client.close();
      throw error;
    }
  }

  // アプリ終了時にDB接続を閉じる。
  onApplicationShutdown(): void {
    this.client.close();
  }
}
