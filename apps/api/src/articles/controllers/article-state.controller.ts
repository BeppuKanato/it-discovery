import { Body, Controller, Get, Header, Inject, NotFoundException, Param, Put, UseFilters } from '@nestjs/common';
import type { ArticleStateOperationResponse, ArticleStateResponse } from '@it-discovery/contracts';
import { ArticleStateService } from '../services/article-state.service';
import { ArticleIdPipe } from './pipes/article-id.pipe';
import { ArticleStateExceptionFilter } from './filters/article-state-exception.filter';
import { toStateOperationResponse, toStateValue } from './formatters/article-state.formatter';

// このControllerは記事ごとの状態の入口。操作結果の照会は別Controllerへ分ける。
@Controller('articles/:articleId/state')
@UseFilters(ArticleStateExceptionFilter)
export class ArticleStateController {
  constructor(@Inject(ArticleStateService) private readonly service: ArticleStateService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getState(@Param('articleId', ArticleIdPipe) articleId: number): ArticleStateResponse {
    const state = this.service.getState(articleId);
    if (!state) throw new NotFoundException({ code: 'ARTICLE_NOT_FOUND', message: '記事は保持されていません。' });
    return { articleId, state: toStateValue(state) };
  }

  // @BodyはJSON本文を渡す。unknownのまま共通の入力検証へ送り、型を決めつけない。
  @Put()
  @Header('Cache-Control', 'no-store')
  apply(@Param('articleId', ArticleIdPipe) articleId: number, @Body() body: unknown): ArticleStateOperationResponse {
    return toStateOperationResponse(this.service.apply(articleId, body));
  }
}
