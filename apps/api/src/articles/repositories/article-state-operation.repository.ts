import type { StoredStateOperation } from '../models/article-state-operation';

// 操作結果は記事を削除しても保持する。記事状態そのものとは別の保存責任。
export abstract class ArticleStateOperationRepository {
  abstract findById(operationId: string): StoredStateOperation | undefined;
  // 呼び出し元のトランザクションに参加し、状態変更と結果記録を一括確定する。
  abstract insert(operation: StoredStateOperation): void;
}
