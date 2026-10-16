import type { ArticleState } from './article-state';

// kindで型を絞ると、その操作に必要な値だけを使える（判別可能なunion）。
export type StateChange =
  | { kind: 'interested' | 'pinned'; value: boolean }
  | { kind: 'opened'; openedAt: Date };

export type StateOperationResult = { operationId: string; articleId: number } & (
  | { status: 'saved'; state: ArticleState }
  | { status: 'missing'; state: null }
);

export interface StoredStateOperation {
  operationId: string;
  requestKey: string;
  result: StateOperationResult;
}

// HTTPのステータスはここでは知らない。入口側がcodeをHTTPエラーへ変換する。
export class StateOperationError extends Error {
  constructor(readonly code: 'INVALID_STATE_INPUT' | 'OPERATION_CONFLICT', message: string) {
    super(message);
  }
}
