import type { ArticlePageResponse } from '@it-discovery/contracts';
import type { ArticleListKind, ArticlePage } from '../../models/article-page';
import { encodeArticleCursor } from './article-cursor.formatter';
import { toArticleListItem } from './article.formatter';

// カード情報の変換は仕分けと共有し、一覧用の続き位置だけをここで付ける。
export function toArticlePageResponse(page: ArticlePage, kind: ArticleListKind, sourceId?: string): ArticlePageResponse {
  return {
    articles: page.articles.map(toArticleListItem),
    hasMore: page.hasMore,
    nextCursor: page.nextPosition ? encodeArticleCursor(page.nextPosition, kind, sourceId) : null,
  };
}
