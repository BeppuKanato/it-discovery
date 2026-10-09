// 情報源の取得結果を保存用の共通データとして表す。
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
