import type { ArticleListItem, ArticleStateMutationRequest, ArticleStateOperationResponse } from '@it-discovery/contracts';

// ここでは一覧の二つの操作だけを扱う。元記事を開いたときの既読操作はIssue #12で接続する。
export type StateField = 'interested' | 'pinned';
export interface PendingStateOperation {
  order: number;
  article: ArticleListItem;
  request: ArticleStateMutationRequest & { change: { kind: StateField; value: boolean } };
}

// 通信と端末保存の実装を分け、順序制御を本物のサーバーなしでも確認できるようにする。
export interface ArticleStateApi {
  applyArticleState(articleId: number, request: ArticleStateMutationRequest, signal?: AbortSignal): Promise<ArticleStateOperationResponse>;
  getArticleStateOperation(operationId: string, signal?: AbortSignal): Promise<ArticleStateOperationResponse | undefined>;
}
export interface StateOperationStore {
  load(): Promise<PendingStateOperation[]>;
  put(operation: PendingStateOperation): Promise<void>;
  remove(operationId: string): Promise<void>;
}

// HTTPの詳細を送信管理へ持ち込まず、再試行できるかどうかの意味で失敗を伝える。
export class StateRequestError extends Error {
  constructor(public readonly kind: 'invalid' | 'blocked' | 'temporary', message: string) { super(message); }
}

export interface StateProjection {
  readonly version: number;
  accept(articles: ArticleListItem[], readVersion: number): void;
  project(article: ArticleListItem): ArticleListItem | null;
  supplements(): ArticleListItem[];
}
