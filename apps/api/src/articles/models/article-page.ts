import type { Article } from './article';
import type { ArticleState } from './article-state';

export const ARTICLE_PAGE_SIZE = 20;
export type ArticleListKind = 'all' | 'interested';

export interface ArticlePagePosition {
  fetchedAt: Date;
  articleId: number;
}

export interface ArticlePageQuery {
  kind: ArticleListKind;
  limit: number;
  before?: ArticlePagePosition;
}

export interface ArticleListEntry {
  article: Article;
  state: ArticleState;
  source: {
    sourceId: string;
    siteName: string;
    iconUrl: string | null;
  };
}

export interface ArticlePage {
  articles: ArticleListEntry[];
  nextPosition: ArticlePagePosition | null;
  hasMore: boolean;
}

export class InvalidArticlePageQueryError extends Error {}
