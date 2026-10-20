// 値を明示して変更する。反転や既読解除はAPIの操作として用意しない。
export type ArticleStateChange =
  | { kind: 'interested'; value: boolean }
  | { kind: 'pinned'; value: boolean }
  | { kind: 'opened'; openedAt: string };

// 操作記録を持たない直接保存用の本文。成功応答はArticleStateResponse。
export interface ArticleStateUpdateRequest {
  change: ArticleStateChange;
}

// 旧フロントの型チェックを保つためだけに残す。新しいAPIはoperationIdを受け付けない。
// フロントの直接保存への切り替え時に、この旧契約と利用箇所を削除する。
/** @deprecated 新APIではArticleStateUpdateRequestを使う。 */
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

// 旧フロント専用の応答型。新APIはArticleStateResponse、記事なしは404を返す。
/** @deprecated 新APIではArticleStateResponseを使う。 */
export type ArticleStateOperationResponse = {
  operationId: string;
  articleId: number;
} & (
  | { status: 'saved'; state: ArticleStateValue }
  | { status: 'missing'; state: null }
);
