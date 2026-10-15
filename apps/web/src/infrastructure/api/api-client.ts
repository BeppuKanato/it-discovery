import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { ArticlePageRequest, ArticlePageResponse, HealthResponse } from '@it-discovery/contracts';
import { isArticlePageResponse } from './article-page-response';

export class ApiClient {
  private readonly http: AxiosInstance;

  constructor(baseURL: string) {
    this.http = axios.create({ baseURL, timeout: 10_000 });
  }

  // 一覧の一ページを取得し、表示用の形式を確認する。
  async getArticlePage(request: ArticlePageRequest, signal?: AbortSignal): Promise<ArticlePageResponse> {
    const { data } = await this.http.get<unknown>('/articles', { params: request, signal });
    if (!isArticlePageResponse(data, request.cursor)) {
      throw new Error('一覧の応答を確認できませんでした。');
    }
    return data;
  }

  // 疎通確認の応答を取得して形式を確認する。
  async getHealth(): Promise<HealthResponse> {
    const { data } = await this.http.get<unknown>('/health');
    if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok'
      || !('message' in data) || typeof data.message !== 'string') {
      throw new Error('サーバーの応答を確認できませんでした。');
    }
    return { status: data.status, message: data.message };
  }
}
