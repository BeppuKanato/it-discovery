import { Controller, Get, Header, Inject, NotFoundException, Param, UseFilters } from '@nestjs/common';
import type { ArticleStateOperationResponse } from '@it-discovery/contracts';
import { ArticleStateService } from '../services/article-state.service';
import { ArticleStateExceptionFilter } from './filters/article-state-exception.filter';
import { toStateOperationResponse } from './formatters/article-state.formatter';

@Controller('article-state-operations')
@UseFilters(ArticleStateExceptionFilter)
export class ArticleStateOperationController {
  constructor(@Inject(ArticleStateService) private readonly service: ArticleStateService) {}

  // 現在の状態ではなく、その操作の処理結果を返す。古い結果でも再実行はしない。
  @Get(':operationId')
  @Header('Cache-Control', 'no-store')
  getOperation(@Param('operationId') operationId: string): ArticleStateOperationResponse {
    const result = this.service.getOperation(operationId);
    if (!result) {
      throw new NotFoundException({ code: 'OPERATION_NOT_FOUND',
        message: '操作結果は未記録です。元の要求の失敗を意味しません。同じ操作IDで再送してください。' });
    }
    return toStateOperationResponse(result);
  }
}
