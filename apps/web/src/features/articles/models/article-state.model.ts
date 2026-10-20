import type { ArticleStateResponse, ArticleStateUpdateRequest, ArticleStateValue } from '@it-discovery/contracts';
import { ApiError } from '../../../infrastructure/api/api-error';

export type ArticleField = 'pinned' | 'interested';
export interface ArticleStateApi {
  updateArticleState(articleId: number, request: ArticleStateUpdateRequest, signal?: AbortSignal): Promise<ArticleStateResponse>;
  getArticleState(articleId: number, signal?: AbortSignal): Promise<ArticleStateResponse>;
}
export class ArticleStateError extends Error {
  constructor(readonly kind: 'rejected' | 'missing' | 'uncertain') { super(kind); }
}

// Modelは表示状態を持たず、目的別の保存・確認を通信へつなぐ。
export class ArticleStateModel {
  constructor(private readonly api: ArticleStateApi) {}

  setField(articleId: number, field: ArticleField, value: boolean, signal?: AbortSignal): Promise<ArticleStateValue> {
    return this.save(articleId, { change: { kind: field, value } }, signal);
  }

  // 受け付けた開く操作の日時を保存する。外部への移動はこの応答を待たせない。
  recordOpened(articleId: number, openedAt: string, signal?: AbortSignal): Promise<ArticleStateValue> {
    return this.save(articleId, { change: { kind: 'opened', openedAt } }, signal);
  }

  async getState(articleId: number, signal?: AbortSignal): Promise<ArticleStateValue> {
    try { return (await this.api.getArticleState(articleId, signal)).state; }
    catch (error) { throw this.classify(error); }
  }

  private async save(articleId: number, request: ArticleStateUpdateRequest, signal?: AbortSignal): Promise<ArticleStateValue> {
    try { return (await this.api.updateArticleState(articleId, request, signal)).state; }
    catch (error) { throw this.classify(error); }
  }

  private classify(error: unknown): ArticleStateError {
    if (error instanceof ApiError && error.status === 404) return new ArticleStateError('missing');
    // 500やタイムアウトは、DB保存後に返事だけ失われた可能性がある。
    if (error instanceof ApiError && error.status !== undefined && [400, 401, 403, 409, 422].includes(error.status)) {
      return new ArticleStateError('rejected');
    }
    return new ArticleStateError('uncertain');
  }
}
