import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { articleStateOperations } from '../../infrastructure/database/schema';
import type { StoredStateOperation } from '../models/article-state-operation';
import { ArticleStateOperationRepository } from './article-state-operation.repository';

@Injectable()
export class SqliteArticleStateOperationRepository extends ArticleStateOperationRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) { super(); }

  // DB列からアプリの操作結果へ変換する。再送するかの判断はServiceが担当する。
  findById(operationId: string): StoredStateOperation | undefined {
    const row = this.database.db.select().from(articleStateOperations)
      .where(eq(articleStateOperations.operationId, operationId)).get();
    if (!row) return undefined;
    const identity = { operationId: row.operationId, articleId: row.articleId };
    if (row.status === 'missing') {
      return { operationId: row.operationId, requestKey: row.requestKey,
        result: { ...identity, status: 'missing', state: null } };
    }
    // savedの2つのboolean列が存在することはDBのCHECK制約でも保証する。
    if (row.interested === null || row.pinned === null) throw new Error('Invalid stored operation state');
    return { operationId: row.operationId, requestKey: row.requestKey,
      result: { ...identity, status: 'saved', state: {
        interested: row.interested, pinned: row.pinned, lastOpenedAt: row.lastOpenedAt,
      } } };
  }

  // 同じDatabaseServiceの接続を使い、ArticleRepositoryが開始した保存単位に参加する。
  insert({ operationId, requestKey, result }: StoredStateOperation): void {
    this.database.db.insert(articleStateOperations).values({
      operationId, requestKey, articleId: result.articleId, status: result.status,
      interested: result.state?.interested ?? null,
      pinned: result.state?.pinned ?? null,
      lastOpenedAt: result.state?.lastOpenedAt ?? null,
    }).run();
  }
}
