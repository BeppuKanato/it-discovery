import { ArgumentsHost, Catch, Inject, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SortingError } from '../../models/article-sorting';

// SortingControllerにだけ適用する。DB障害はこのFilterで入力エラーへ変えない。
@Catch(SortingError)
export class SortingExceptionFilter implements ExceptionFilter<SortingError> {
  constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  catch(error: SortingError, host: ArgumentsHost): void {
    const statusCode = error.code === 'BATCH_CONFLICT' ? 409 : 400;
    this.adapter.httpAdapter.reply(host.switchToHttp().getResponse(), {
      statusCode, code: error.code, message: error.message,
    }, statusCode);
  }
}
