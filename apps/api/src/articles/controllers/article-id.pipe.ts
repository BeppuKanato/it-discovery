import { type PipeTransform } from '@nestjs/common';
import { assertArticleId, StateOperationError } from '../models/article-state-operation';

// URLの文字列を整数へ変換する。Numberへの変換だけでは許される01や1e2なども入口で拒否する。
export class ArticleIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new StateOperationError('INVALID_STATE_INPUT', '記事IDの表記が不正です。');
    }
    const articleId = Number(value);
    assertArticleId(articleId);
    return articleId;
  }
}
