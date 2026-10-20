import { ArgumentsHost, Catch, Inject, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { InvalidStateInputError } from '../../models/article-state-change';

// この種類のアプリ入力エラーだけをHTTPへ変換する。DB障害を400にしない。
@Catch(InvalidStateInputError)
export class ArticleStateExceptionFilter implements ExceptionFilter<InvalidStateInputError> {
  constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}

  catch(error: InvalidStateInputError, host: ArgumentsHost): void {
    const statusCode = 400;
    // Adapterを経由し、ServiceやモデルにExpressのResponseを持ち込まない。
    this.adapter.httpAdapter.reply(host.switchToHttp().getResponse(), {
      statusCode, code: error.code, message: error.message,
    }, statusCode);
  }
}
