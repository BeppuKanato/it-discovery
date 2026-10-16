// 値を明示して変更する。反転や既読解除はAPIの操作として用意しない。
export type ArticleStateChange =
  | { kind: 'interested'; value: boolean }
  | { kind: 'pinned'; value: boolean }
  | { kind: 'opened'; openedAt: string };

export interface ArticleStateMutationRequest {
  operationId: string;
  change: ArticleStateChange;
}

// HTTPでDateオブジェクトは送れないため、日時はUTCのISO文字列にする。
export interface ArticleStateValue {
  interested: boolean;
  pinned: boolean;
  lastOpenedAt: string | null;
}

export interface ArticleStateResponse {
  articleId: number;
  state: ArticleStateValue;
}

// missingは再送しても登録できない結果。通信失敗とは区別して端末側で解消できる。
export type ArticleStateOperationResponse = {
  operationId: string;
  articleId: number;
} & (
  | { status: 'saved'; state: ArticleStateValue }
  | { status: 'missing'; state: null }
);
