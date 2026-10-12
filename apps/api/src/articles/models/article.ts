// 取得元の形式を変換した記事を表す。
export interface ArticleInput {
  sourceId: string;
  externalArticleId?: string | null;
  url: string;
  title: string;
  description?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  sourceUpdatedAt?: Date | null;
}

export interface Article extends ArticleInput {
  articleId: number;
  fetchedAt: Date;
}

export interface ArticleIdentity {
  sourceId: string;
  kind: 'id' | 'url';
  value: string;
}

export interface NewArticle {
  input: ArticleInput;
  identity: ArticleIdentity;
  fetchedAt: Date;
}

export interface ArticleContent {
  title: string;
  description: string | null;
  author: string | null;
}
