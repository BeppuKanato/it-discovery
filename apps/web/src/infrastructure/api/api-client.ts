import type { CompanionChatRequest, CompanionChatResponse, DiscoveryNote, DiscoveryNoteRequest } from '@it-discovery/contracts';
import { isDiscoveryNote, isNoteCalendar, isNoteDay } from './companion-response';
import type { DiscoveryNoteCalendar, DiscoveryNoteDay } from '@it-discovery/contracts';
import type { AuthSession } from '../auth/auth-session';
import { InterestBatchError } from '../../features/sorting/models/interest-batch-sync.model';
import type { PendingInterestBatch } from '../../features/sorting/models/pending-interest';
import { isInterestBatchResponse } from './interest-batch-response';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { ArticlePageRequest, ArticlePageResponse, ArticleStateUpdateRequest, ArticleStateResponse, SortingCandidatesResponse, InterestBatchResponse, HealthResponse } from '@it-discovery/contracts';
import { isSortingCandidatesResponse } from './sorting-candidates-response';
import { isArticlePageResponse } from './article-page-response';
import { isArticleStateResponse } from './article-state-response';
import { ApiError } from './api-error';
import type { ArticleSource } from '@it-discovery/contracts';
import { isArticleSources } from './article-sources-response';

// 通信設定・JSON検証だけを担当する。保存キュー・操作ID・自動再送は持たない。
export class ApiClient {
  private readonly http: AxiosInstance;
  constructor(baseURL: string, session?: AuthSession) {
    this.http = axios.create({ baseURL, timeout: 10_000 });
    if (session) {
      // 認証エラーでは更新を自動再送しない。VMをログインへ戻し、仕分け記録は保存したままにする。
      this.http.interceptors.request.use(config => {
        const token = session.token();
        if (!token) throw new ApiError(401);
        config.headers.set('Authorization', `Bearer ${token}`);
        return config;
      });
      this.http.interceptors.response.use(response => response, (error: unknown) => {
        if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
          const header = error.config?.headers.get('Authorization');
          if (typeof header === 'string' && header.startsWith('Bearer ')) session.reject(header.slice(7), error.response!.status);
        }
        return Promise.reject(error);
      });
    }
  }

  async getArticlePage(request: ArticlePageRequest, signal?: AbortSignal): Promise<ArticlePageResponse> {
    const { data } = await this.http.get<unknown>('/articles', { params: request, signal });
    if (!isArticlePageResponse(data, request.cursor)) throw new Error('一覧の応答を確認できませんでした。');
    return data;
  }

  async getArticleSources(signal?: AbortSignal): Promise<ArticleSource[]> {
    const { data } = await this.http.get<unknown>('/sources', { signal });
    if (!isArticleSources(data)) throw new Error('取得先の応答を確認できませんでした。');
    return data;
  }

  async getSortingCandidates(signal?: AbortSignal): Promise<SortingCandidatesResponse> {
    const { data } = await this.http.get<unknown>('/sorting/candidates', { signal });
    if (!isSortingCandidatesResponse(data)) throw new Error('仕分け対象の応答を確認できませんでした。');
    return data;
  }

  async getInterestBatchResult(batch: PendingInterestBatch, signal?: AbortSignal): Promise<InterestBatchResponse | undefined> {
    try {
      const { data } = await this.http.get<unknown>(`/sorting/interest-batches/${batch.batchId}`, { signal });
      return this.batchResponse(data,batch);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return undefined;
      throw this.batchError(error);
    }
  }
  async saveInterestBatch(batch: PendingInterestBatch, signal?: AbortSignal): Promise<InterestBatchResponse> {
    try {
      const { data } = await this.http.put<unknown>(`/sorting/interest-batches/${batch.batchId}`,
        { revision: batch.revision, articleIds: batch.articleIds }, { signal });
      return this.batchResponse(data,batch);
    } catch (error) { throw this.batchError(error); }
  }
  private batchResponse(data: unknown, batch: PendingInterestBatch): InterestBatchResponse {
    if (!isInterestBatchResponse(data,batch)) throw new InterestBatchError('blocked','保存結果の回ID・版・内容を確認できません。端末記録は残しています。');
    return data;
  }
  private batchError(error: unknown): InterestBatchError {
    if (error instanceof InterestBatchError) return error;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const blocked = status !== undefined && status >= 400 && status < 500 && ![408,429].includes(status);
    return new InterestBatchError(blocked ? 'blocked' : 'temporary',blocked
      ? '登録が受け付けられませんでした。認証・接続先・保存結果をご確認ください。端末記録は残しています。'
      : '登録の保存結果を確認できませんでした。端末記録を残して再試行します。');
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

  async chat(request: CompanionChatRequest, signal?: AbortSignal): Promise<CompanionChatResponse> {
    const { data } = await this.http.post<unknown>('/companion/chat', request, { signal, timeout: 25_000 });
    if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 1600) throw new Error('会話の応答が不正です。');
    return { text: data.text };
  }
  async getDiscoveryNotes(signal?: AbortSignal): Promise<DiscoveryNote[]> {
    const { data } = await this.http.get<unknown>('/companion/notes', { signal });
    if (!Array.isArray(data) || data.length > 100 || !data.every(isDiscoveryNote)) throw new Error('ノートの応答が不正です。');
    return data;
  }
  async getNoteCalendar(month: string, signal?: AbortSignal): Promise<DiscoveryNoteCalendar> {
    const { data } = await this.http.get<unknown>('/companion/notes/calendar', { params: { month }, signal });
    if (!isNoteCalendar(data, month)) throw new Error('発見カレンダーの応答が不正です。');
    return data;
  }
  async getNoteDay(date: string, offset: number, signal?: AbortSignal): Promise<DiscoveryNoteDay> {
    const { data } = await this.http.get<unknown>('/companion/notes/day', { params: { date, offset }, signal });
    if (!isNoteDay(data, date)) throw new Error('その日の発見の応答が不正です。');
    return data;
  }
  async saveDiscoveryNote(request: DiscoveryNoteRequest, signal?: AbortSignal): Promise<DiscoveryNote> {
    const { data } = await this.http.post<unknown>('/companion/notes', request, { signal });
    if (!isDiscoveryNote(data)) throw new Error('保存結果が不正です。');
    return data;
  }
  async deleteDiscoveryNote(id: number, signal?: AbortSignal): Promise<void> {
    const { data } = await this.http.delete<unknown>(`/companion/notes/${id}`, { signal });
    if (!data || typeof data !== 'object' || !('deleted' in data) || data.deleted !== true) throw new Error('削除結果が不正です。');
  }

  async getHealth(): Promise<HealthResponse> {
    const { data } = await this.http.get<unknown>('/health');
    if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok'
      || !('message' in data) || typeof data.message !== 'string') throw new Error('サーバーの応答を確認できませんでした。');
    return { status: data.status, message: data.message };
  }
}
