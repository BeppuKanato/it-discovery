import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { articleInterestBatches } from '../../infrastructure/database/schema';
import type { InterestBatchResult, StoredInterestBatch } from '../models/article-sorting';
import { ArticleInterestBatchRepository } from './article-interest-batch.repository';

@Injectable()
export class SqliteArticleInterestBatchRepository extends ArticleInterestBatchRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) { super(); }

  // 自分たちが保存した結果JSONを復元する。HTTP入力の検証はService側のValidatorで行う。
  findById(batchId: string): StoredInterestBatch | undefined {
    const row = this.database.db.select().from(articleInterestBatches)
      .where(eq(articleInterestBatches.batchId, batchId)).get();
    if (!row) return undefined;
    // asは保存形式の型指定。日時などの変換はなく、最大10件の記事IDと結果をそのまま復元する。
    const results = JSON.parse(row.results) as InterestBatchResult['results'];
    return { batchId: row.batchId, revision: row.revision, requestKey: row.requestKey,
      result: { batchId: row.batchId, revision: row.revision, results } };
  }

  // 同じDB接続のトランザクションへ参加する。ここではcommitせず、呼び出し元が一括確定する。
  insert({ batchId, revision, requestKey, result }: StoredInterestBatch): void {
    this.database.db.insert(articleInterestBatches).values({
      batchId, revision, requestKey, results: JSON.stringify(result.results),
    }).run();
  }
}
