import { Body, Controller, Get, Header, Inject, NotFoundException, Param, Put, UseFilters } from '@nestjs/common';
import type { InterestBatchResponse, SortingCandidatesResponse } from '@it-discovery/contracts';
import { ArticleSortingService } from '../services/article-sorting.service';
import { SortingExceptionFilter } from './filters/sorting-exception.filter';
import { toInterestBatchResponse, toSortingCandidatesResponse } from './formatters/article-sorting.formatter';

@Controller('sorting')
@UseFilters(SortingExceptionFilter)
export class SortingController {
  constructor(@Inject(ArticleSortingService) private readonly service: ArticleSortingService) {}

  // 件数・並び順はServiceの固定ルール。取得で仕分け履歴を作ったり、外部収集を始めたりしない。
  @Get('candidates')
  @Header('Cache-Control', 'no-store')
  getCandidates(): SortingCandidatesResponse {
    return toSortingCandidatesResponse(this.service.getCandidates());
  }

  // @Paramで回ID、@Bodyで最終結果を受け取る。未検証の本文なのでunknownとする。
  // ServiceのnormalizeBatchIdがUUID、parseInterestBatchが版・ID集合・余分な項目を検証する。
  @Put('interest-batches/:batchId')
  @Header('Cache-Control', 'no-store')
  submit(@Param('batchId') batchId: string, @Body() body: unknown): InterestBatchResponse {
    return toInterestBatchResponse(this.service.submit(batchId, body));
  }

  // IDのUUID検証はService内。受理済み結果があれば、今の状態ではなく送信時の結果を返す。
  @Get('interest-batches/:batchId')
  @Header('Cache-Control', 'no-store')
  getBatch(@Param('batchId') batchId: string): InterestBatchResponse {
    const result = this.service.getBatch(batchId);
    if (!result) throw new NotFoundException({ code: 'BATCH_NOT_FOUND',
      message: '結果は未記録です。元の要求の失敗を意味しません。同じ回ID・版・内容で再送してください。' });
    return toInterestBatchResponse(result);
  }
}
