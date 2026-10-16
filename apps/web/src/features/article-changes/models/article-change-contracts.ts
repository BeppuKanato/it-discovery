import type { ArticleListItem, ArticleStateMutationRequest, ArticleStateOperationResponse } from '@it-discovery/contracts';

// ここでは一覧の二つの操作だけを扱う。元記事を開いたときの既読操作はIssue #12で接続する。
export type StateField = 'interested' | 'pinned';
export interface UnfinishedArticleChange {
  order: number;
  article: ArticleListItem;
  request: ArticleStateMutationRequest & { change: { kind: StateField; value: boolean } };
}

// 通信と端末保存の実装を分け、順序制御を本物のサーバーなしでも確認できるようにする。
export interface ArticleChangeApi {
  applyArticleState(articleId: number, request: ArticleStateMutationRequest, signal?: AbortSignal): Promise<ArticleStateOperationResponse>;
  getArticleStateOperation(operationId: string, signal?: AbortSignal): Promise<ArticleStateOperationResponse | undefined>;
}
export interface UnfinishedArticleChangeStorage {
  load(): Promise<UnfinishedArticleChange[]>;
  put(operation: UnfinishedArticleChange): Promise<void>;
  remove(operationId: string): Promise<void>;
}

// HTTPの詳細を送信管理へ持ち込まず、再試行できるかどうかの意味で失敗を伝える。
export class ArticleChangeRequestError extends Error {
  constructor(public readonly kind: 'invalid' | 'blocked' | 'temporary', message: string) { super(message); }
}


// ViewModelが利用する操作の約束。具体的な同期クラスの内部には依存しない。
export interface ArticleChangeActions {
  restoreAndSyncUnfinishedChanges(): Promise<void>;
  setArticleState(articleId: number, field: StateField, value: boolean): void;
  retryUnfinishedChanges(): void;
  discardBlockedChanges(): void;
}

// ViewModelがViewへ渡す同期状況の値。操作関数やStore自体は含めない。
export interface ArticleSyncDisplay {
  ready: boolean;
  canChange: boolean;
  pendingCount: number;
  blockedCount: number;
  notice: string;
  storageError: boolean;
  startupError: string;
  online: boolean;
}
