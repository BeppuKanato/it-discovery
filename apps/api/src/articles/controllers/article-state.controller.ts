import { Body, Controller, Get, Header, Inject, NotFoundException, Param, Put, UseFilters } from '@nestjs/common';
import type { ArticleStateResponse } from '@it-discovery/contracts';
import { ArticleStateService } from '../services/article-state.service';
import { ArticleIdPipe } from './pipes/article-id.pipe';
import { ArticleStateExceptionFilter } from './filters/article-state-exception.filter';
import { toStateValue } from './formatters/article-state.formatter';

// 記事の現在状態の取得と、指定した項目の保存だけを受け付ける。
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

  // @Bodyで受けたJSONはunknownのままServiceの共通検証へ渡す。
  // 成功応答は現在状態のGETと同じ形式。存在しない記事への変更は404とする。
  @Put()
  @Header('Cache-Control', 'no-store')
  apply(@Param('articleId', ArticleIdPipe) articleId: number, @Body() body: unknown): ArticleStateResponse {
    const state = this.service.apply(articleId, body);
    if (!state) throw new NotFoundException({ code: 'ARTICLE_NOT_FOUND', message: '記事は保持されていません。' });
    return { articleId, state: toStateValue(state) };
  }
}
