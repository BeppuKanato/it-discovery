import { Inject, Injectable, HttpException } from '@nestjs/common';
import type { DiscoveryNote } from '@it-discovery/contracts';
import { CompanionRepository } from './companion.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
@Injectable()
export class SqliteCompanionRepository extends CompanionRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) { super(); }
  // 通信前に回数を確保し、同時要求・再起動で上限を超えないようにする。失敗した要求も数える。
  reserve(now = new Date()): void {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
    this.database.client.transaction(() => {
      for (const [period, limit] of [[`day:${day}`, 30], [`month:${day.slice(0, 7)}`, 500]] as const) {
        const row = this.database.client.prepare('SELECT requests, last_requested_at AS last FROM companion_usage WHERE period = ?').get(period) as { requests: number; last: number } | undefined;
        if (row && row.requests >= limit) throw new HttpException('会話の利用上限に達しました。時間をおいて利用してください。', 429);
        if (period.startsWith('day:') && row && now.getTime() - row.last < 3000) throw new HttpException('少し間をあけて話しかけてください。', 429);
        this.database.client.prepare('INSERT INTO companion_usage(period, requests, last_requested_at) VALUES (?, 1, ?) ON CONFLICT(period) DO UPDATE SET requests = requests + 1, last_requested_at = excluded.last_requested_at').run(period, now.getTime());
      }
    }).immediate();
  }
  article(id: number): { title: string; description: string | null } | undefined {
    return this.database.client.prepare('SELECT title, description FROM articles WHERE article_id = ?').get(id) as { title: string; description: string | null } | undefined;
  }
  listNotes(): DiscoveryNote[] {
    const rows = this.database.client.prepare('SELECT id, text, article_id AS articleId, article_title AS articleTitle, created_at AS createdAt FROM discovery_notes ORDER BY id DESC LIMIT 100').all();
    return rows as DiscoveryNote[];
  }
  saveNote(text: string, articleId?: number): DiscoveryNote {
    // 記事が保持期限で消えてもノートと記録時のタイトルは残す。外部キーで連動削除しない。
    const title = articleId ? this.article(articleId)?.title ?? null : null;
    const createdAt = new Date().toISOString();
    const saved = this.database.client.prepare('INSERT INTO discovery_notes(text, article_id, article_title, created_at) VALUES (?, ?, ?, ?)').run(text, articleId ?? null, title, createdAt);
    return { id: Number(saved.lastInsertRowid), text, articleId: articleId ?? null, articleTitle: title, createdAt };
  }
  deleteNote(id: number): void { this.database.client.prepare('DELETE FROM discovery_notes WHERE id = ?').run(id); }
}
