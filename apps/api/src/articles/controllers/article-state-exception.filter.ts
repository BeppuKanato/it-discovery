import { ArgumentsHost, Catch, Inject, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { StateOperationError } from '../models/article-state-operation';

// この種類のアプリ入力エラーだけをHTTPへ変換する。DB障害を400にしない。
@Catch(StateOperationError)
export class ArticleStateExceptionFilter implements ExceptionFilter<StateOperationError> {
  constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}

  catch(error: StateOperationError, host: ArgumentsHost): void {
    const statusCode = error.code === 'OPERATION_CONFLICT' ? 409 : 400;
    // Adapterを経由し、ServiceやモデルにExpressのResponseを持ち込まない。
    this.adapter.httpAdapter.reply(host.switchToHttp().getResponse(), {
      statusCode, code: error.code, message: error.message,
    }, statusCode);
  }
}
