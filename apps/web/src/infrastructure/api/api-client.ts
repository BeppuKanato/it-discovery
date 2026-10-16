import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { ArticlePageRequest, ArticlePageResponse, HealthResponse, ArticleStateMutationRequest, ArticleStateOperationResponse } from '@it-discovery/contracts';
import { isArticlePageResponse } from './article-page-response';
import { isArticleStateOperationResponse } from './article-state-response';
import { StateRequestError } from '../../features/article-state/models/state-sync';

// 通信エラーや500は保存済みの可能性がある。400だけを入力拒否、認証・競合は要確認とする。
function stateRequestError(error: unknown): StateRequestError {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 400) return new StateRequestError('invalid', '変更が受け付けられなかったため、その変更を戻しました。');
  if (status !== undefined && status >= 400 && status < 500 && ![408, 425, 429].includes(status)) {
    return new StateRequestError('blocked', '本人確認・操作内容を確認して再試行してください。未送信変更は残しています。');
  }
  return new StateRequestError('temporary', '保存結果を確認しています。通信の復旧後に再試行します。');
}

export class ApiClient {
  private readonly http: AxiosInstance;

  constructor(baseURL: string) {
    // createで共通の接続先・待ち時間を持つAxiosインスタンスを作る。10秒を超えた通信は失敗扱い。
    this.http = axios.create({ baseURL, timeout: 10_000 });
  }

  // 一覧の一ページを取得し、表示用の形式を確認する。
  async getArticlePage(request: ArticlePageRequest, signal?: AbortSignal): Promise<ArticlePageResponse> {
    // unknownは受信JSONを未検証の値として扱う型。TypeScriptの型だけでは通信内容を保証できない。
    // paramsはクエリ文字列へ、signalは通信を中止するためにAxiosへ渡す。
    const { data } = await this.http.get<unknown>('/articles', { params: request, signal });
    if (!isArticlePageResponse(data, request.cursor)) {
      throw new Error('一覧の応答を確認できませんでした。');
    }
    return data;
  }

  // 反転ではなく、明示した値と同じ操作IDを送る。再送でも要求内容を変更しない。
  async applyArticleState(articleId: number, request: ArticleStateMutationRequest, signal?: AbortSignal): Promise<ArticleStateOperationResponse> {
    try {
      const { data } = await this.http.put<unknown>(`/articles/${articleId}/state`, request, { signal });
      if (!isArticleStateOperationResponse(data, request.operationId, articleId)) throw new Error('操作結果が一致しません。');
      return data;
    } catch (error) { throw stateRequestError(error); }
  }

  // 404は「結果未記録」。元の保存要求が失敗したという意味にはしない。
  async getArticleStateOperation(operationId: string, signal?: AbortSignal): Promise<ArticleStateOperationResponse | undefined> {
    try {
      const { data } = await this.http.get<unknown>(`/article-state-operations/${operationId}`, { signal });
      if (!isArticleStateOperationResponse(data, operationId)) throw new Error('操作結果が一致しません。');
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return undefined;
      const failure = stateRequestError(error);
      // 照会の400は元のPUTの失敗を証明しない。変更を戻さず、要確認として残す。
      throw failure.kind === 'invalid' ? new StateRequestError('blocked', '保存結果を照会できません。変更を残して再確認してください。') : failure;
    }
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
