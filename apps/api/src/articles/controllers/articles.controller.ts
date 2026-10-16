import { BadRequestException, Controller, Get, Header, Inject, Query } from '@nestjs/common';
import type { ArticlePageResponse } from '@it-discovery/contracts';
import { ArticleService } from '../services/article.service';
import { InvalidArticlePageQueryError, type ArticlePageQuery } from '../models/article-page';
import { ArticlePageQueryPipe } from './pipes/article-page-query.pipe';
import { toArticlePageResponse } from './formatters/article-page.formatter';

@Controller('articles')
export class ArticlesController {
  constructor(@Inject(ArticleService) private readonly service: ArticleService) {}

  // 一覧を取得し、入力エラーをHTTP 400へ変換する。
  @Get()
  @Header('Cache-Control', 'no-store')
  getPage(@Query(ArticlePageQueryPipe) query: ArticlePageQuery): ArticlePageResponse {
    try {
      return toArticlePageResponse(this.service.getPage(query), query.kind);
    } catch (error) {
      if (error instanceof InvalidArticlePageQueryError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
