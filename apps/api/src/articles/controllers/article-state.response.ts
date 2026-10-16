import type { ArticleStateOperationResponse, ArticleStateValue } from '@it-discovery/contracts';
import type { ArticleState } from '../models/article-state';
import type { StateOperationResult } from '../models/article-state-operation';

// 内部のDateをHTTPで扱えるISO文字列へ変換する。状態の判断は行わない。
export function toStateValue(state: ArticleState): ArticleStateValue {
  return { interested: state.interested, pinned: state.pinned,
    lastOpenedAt: state.lastOpenedAt?.toISOString() ?? null };
}

export function toStateOperationResponse(result: StateOperationResult): ArticleStateOperationResponse {
  return result.status === 'missing' ? result : { ...result, state: toStateValue(result.state) };
}
