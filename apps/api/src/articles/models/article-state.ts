export interface ArticleState {
  interested: boolean;
  pinned: boolean;
  lastOpenedAt: Date | null;
}

// 既読を判定する。
export function isRead(state: ArticleState): boolean {
  return state.lastOpenedAt !== null;
}

// 仕分け対象か判定する。
export function isSortingCandidate(state: ArticleState): boolean {
  return !isRead(state) && !state.interested && !state.pinned;
}

// 自動削除からの保護を判定する。
export function isProtected(state: ArticleState): boolean {
  return state.interested || state.pinned;
}
