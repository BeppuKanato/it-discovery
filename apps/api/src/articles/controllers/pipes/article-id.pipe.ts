import { type PipeTransform } from '@nestjs/common';
import { InvalidStateInputError } from '../../models/article-state-change';
import { assertArticleId } from '../../validators/article-id.validator';

// URLの文字列を整数へ変換する。Numberへの変換だけでは許される01や1e2なども入口で拒否する。
export class ArticleIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new InvalidStateInputError('記事IDの表記が不正です。');
    }
    const articleId = Number(value);
    assertArticleId(articleId);
    return articleId;
  }
}
