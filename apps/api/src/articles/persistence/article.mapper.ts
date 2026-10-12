import type { articles } from '../../database/schema';
import type { Article } from '../models/article';

// DBの照合用項目を除き、アプリの記事形式へ変換する。
export function toArticle(row: typeof articles.$inferSelect): Article {
  const { identityKind: _kind, identityValue: _value, ...article } = row;
  return article;
}
