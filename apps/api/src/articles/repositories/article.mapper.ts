import type { articles, articleStates } from '../../infrastructure/database/schema';
import type { Article } from '../models/article';
import type { ArticleState } from '../models/article-state';

// DBの結合用articleIdを除き、保存直後と再送時で状態の形を一致させる。
export function toArticleState(row: typeof articleStates.$inferSelect): ArticleState {
  return { interested: row.interested, pinned: row.pinned, lastOpenedAt: row.lastOpenedAt };
}

// DBの照合用項目を除き、アプリの記事形式へ変換する。
export function toArticle(row: typeof articles.$inferSelect): Article {
  const { identityKind: _kind, identityValue: _value, ...article } = row;
  return article;
}
