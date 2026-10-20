// kindで型を絞り、その変更に必要な値だけを扱う。反転命令は受け付けない。
export type StateChange =
  | { kind: 'interested' | 'pinned'; value: boolean }
  | { kind: 'opened'; openedAt: Date };

// HTTPのステータスは入口のFilterが決める。Serviceや検証はHTTPへ依存しない。
export class InvalidStateInputError extends Error {
  readonly code = 'INVALID_STATE_INPUT';
}
