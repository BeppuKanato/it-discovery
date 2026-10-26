import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { ARTICLE_PAGE_SIZE, type ArticlePageQuery } from '../../models/article-page';
import { decodeArticleCursor } from '../formatters/article-cursor.formatter';
import { isArticleSourceId } from '../../validators/article-source';

@Injectable()
export class ArticlePageQueryPipe implements PipeTransform<unknown, ArticlePageQuery> {
  // HTTPの文字列パラメータを検証し、一覧の検索条件へ変換する。
  transform(value: unknown): ArticlePageQuery {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('一覧のパラメータが不正です。');
    }
    const query = value as Record<string, unknown>;
    if (Object.keys(query).some((key) => !['kind', 'limit', 'cursor', 'sourceId'].includes(key))) {
      throw new BadRequestException('kind・limit・cursor・sourceId以外のパラメータは指定できません。');
    }
    const kind = query['kind'] ?? 'all';
    if (kind !== 'all' && kind !== 'interested') {
      throw new BadRequestException('kindはallまたはinterestedを指定してください。');
    }
    let limit = ARTICLE_PAGE_SIZE;
    if (query['limit'] !== undefined) {
      if (typeof query['limit'] !== 'string' || !/^[1-9]\d?$/.test(query['limit'])) {
        throw new BadRequestException(`limitは1〜${ARTICLE_PAGE_SIZE}の整数を指定してください。`);
      }
      limit = Number(query['limit']);
    }
    const token = query['cursor'];
    if (token !== undefined && typeof token !== 'string') {
      throw new BadRequestException('cursorは一つだけ指定してください。');
    }
    const sourceId = query['sourceId'];
    if (!isArticleSourceId(sourceId)) throw new BadRequestException('sourceIdは一つの取得先IDを指定してください。');
    return { kind, limit, ...(sourceId !== undefined ? { sourceId } : {}),
      before: token === undefined ? undefined : decodeArticleCursor(token, kind, sourceId) };
  }
}
