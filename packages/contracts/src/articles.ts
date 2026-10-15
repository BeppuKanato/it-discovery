export type ArticleListKind = 'all' | 'interested';

// 一覧取得に指定できる値を表す。
export interface ArticlePageRequest {
  kind?: ArticleListKind;
  limit?: number;
  cursor?: string;
}

// 一覧に表示する記事・出典・状態のJSONを表す。
export interface ArticleListItem {
  articleId: number;
  url: string;
  title: string;
  description: string | null;
  author: string | null;
  fetchedAt: string;
  publishedAt: string | null;
  sourceUpdatedAt: string | null;
  source: {
    sourceId: string;
    siteName: string;
    iconUrl: string | null;
  };
  state: {
    interested: boolean;
    pinned: boolean;
    lastOpenedAt: string | null;
  };
}

export interface ArticlePageResponse {
  articles: ArticleListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}
