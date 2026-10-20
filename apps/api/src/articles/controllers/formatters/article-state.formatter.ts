import type { ArticleStateValue } from '@it-discovery/contracts';
import type { ArticleState } from '../../models/article-state';

// 内部のDateをHTTPで扱えるISO文字列へ変換する。状態の判断は行わない。
export function toStateValue(state: ArticleState): ArticleStateValue {
  return { interested: state.interested, pinned: state.pinned,
    lastOpenedAt: state.lastOpenedAt?.toISOString() ?? null };
}
