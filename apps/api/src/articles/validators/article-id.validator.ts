import { InvalidStateInputError } from '../models/article-state-change';

// PipeとServiceが共有する記事IDの条件。HTTPの表記変換やDBへの存在確認は行わない。
export function assertArticleId(articleId: number): void {
  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    throw new InvalidStateInputError('記事IDは正の安全な整数を指定してください。');
  }
}
