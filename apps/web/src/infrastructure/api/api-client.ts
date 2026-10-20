import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { ArticlePageRequest, ArticlePageResponse, ArticleStateUpdateRequest, ArticleStateResponse, HealthResponse } from '@it-discovery/contracts';
import { isArticlePageResponse } from './article-page-response';
import { isArticleStateResponse } from './article-state-response';
import { ApiError } from './api-error';

// 通信設定・JSON検証だけを担当する。保存キュー・操作ID・自動再送は持たない。
export class ApiClient {
  private readonly http: AxiosInstance;
  constructor(baseURL: string) {
    this.http = axios.create({ baseURL, timeout: 10_000 });
  }

  async getArticlePage(request: ArticlePageRequest, signal?: AbortSignal): Promise<ArticlePageResponse> {
    const { data } = await this.http.get<unknown>('/articles', { params: request, signal });
    if (!isArticlePageResponse(data, request.cursor)) throw new Error('一覧の応答を確認できませんでした。');
    return data;
  }

  async updateArticleState(articleId: number, request: ArticleStateUpdateRequest, signal?: AbortSignal): Promise<ArticleStateResponse> {
    try {
      const { data } = await this.http.put<unknown>(`/articles/${articleId}/state`, request, { signal });
      if (!isArticleStateResponse(data, articleId)) throw new ApiError();
      return data;
    } catch (error) { throw this.stateError(error); }
  }

  async getArticleState(articleId: number, signal?: AbortSignal): Promise<ArticleStateResponse> {
    try {
      const { data } = await this.http.get<unknown>(`/articles/${articleId}/state`, { signal });
      if (!isArticleStateResponse(data, articleId)) throw new ApiError();
      return data;
    } catch (error) { throw this.stateError(error); }
  }

  private stateError(error: unknown): ApiError {
    return error instanceof ApiError ? error : new ApiError(axios.isAxiosError(error) ? error.response?.status : undefined);
  }

  async getHealth(): Promise<HealthResponse> {
    const { data } = await this.http.get<unknown>('/health');
    if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok'
      || !('message' in data) || typeof data.message !== 'string') throw new Error('サーバーの応答を確認できませんでした。');
    return { status: data.status, message: data.message };
  }
}
