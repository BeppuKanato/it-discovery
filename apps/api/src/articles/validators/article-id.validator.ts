import { StateOperationError } from '../models/article-state-operation';

// PipeとServiceが共有する記事IDの条件。HTTPの表記変換やDBへの存在確認は行わない。
export function assertArticleId(articleId: number): void {
  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    throw new StateOperationError('INVALID_STATE_INPUT', '記事IDは正の安全な整数を指定してください。');
  }
}
