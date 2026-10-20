// 値を明示して変更する。反転や既読解除はAPIの操作として用意しない。
export type ArticleStateChange =
  | { kind: 'interested'; value: boolean }
  | { kind: 'pinned'; value: boolean }
  | { kind: 'opened'; openedAt: string };

// 操作記録を持たない直接保存用の本文。成功応答はArticleStateResponse。
export interface ArticleStateUpdateRequest {
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
