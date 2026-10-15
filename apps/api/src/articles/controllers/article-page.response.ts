import type { ArticlePageResponse } from '@it-discovery/contracts';
import type { ArticleListKind, ArticlePage } from '../models/article-page';
import { encodeArticleCursor } from './article-cursor';

// 内部データを表示用JSONへ変換し、日時とカーソルを文字列にする。
export function toArticlePageResponse(page: ArticlePage, kind: ArticleListKind): ArticlePageResponse {
  return {
    articles: page.articles.map(({ article, source, state }) => ({
      articleId: article.articleId,
      url: article.url,
      title: article.title,
      description: article.description ?? null,
      author: article.author ?? null,
      fetchedAt: article.fetchedAt.toISOString(),
      publishedAt: article.publishedAt?.toISOString() ?? null,
      sourceUpdatedAt: article.sourceUpdatedAt?.toISOString() ?? null,
      source: { sourceId: source.sourceId, siteName: source.siteName, iconUrl: source.iconUrl },
      state: {
        interested: state.interested,
        pinned: state.pinned,
        lastOpenedAt: state.lastOpenedAt?.toISOString() ?? null,
      },
    })),
    hasMore: page.hasMore,
    nextCursor: page.nextPosition ? encodeArticleCursor(page.nextPosition, kind) : null,
  };
}
