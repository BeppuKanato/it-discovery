import type { Article, ArticleInput } from './article';
import type { ArticleState } from './article-state';

export interface StoredArticle {
  article: Article;
  state: ArticleState;
}

export abstract class ArticleRepository {
  // 記事を追加し、既存なら内容だけを更新する。
  abstract upsert(input: ArticleInput, fetchedAt?: Date): StoredArticle;
  // 記事と確定状態を取得する。
  abstract findById(articleId: number): StoredArticle | undefined;
  // 指定された状態の項目だけを保存する。
  abstract updateState(articleId: number, patch: Partial<ArticleState>): StoredArticle | undefined;
}
