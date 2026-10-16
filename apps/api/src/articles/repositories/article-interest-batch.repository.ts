import type { StoredInterestBatch } from '../models/article-sorting';

export abstract class ArticleInterestBatchRepository {
  // 最初に確定した版を回IDで取得する。別の版を同じ回へ後から追加しない。
  abstract findById(batchId: string): StoredInterestBatch | undefined;
  // ArticleRepositoryと同じトランザクションで結果を記録する。
  abstract insert(batch: StoredInterestBatch): void;
}
