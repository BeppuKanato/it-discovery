import type { Article, ArticleContent, ArticleIdentity, NewArticle } from '../models/article';
import type { ArticleState } from '../models/article-state';

export interface StoredArticle {
  article: Article;
  state: ArticleState;
}

export abstract class ArticleRepository {
  // 同期処理を一括確定し、例外時は全て取り消す。
  abstract transaction<T>(operation: () => T): T;
  // 識別条件に一致する記事と状態を取得する。
  abstract findByIdentity(identity: ArticleIdentity): StoredArticle | undefined;
  // 記事と初期状態を追加する。
  abstract insert(article: NewArticle): StoredArticle;
  // タイトル・概要・著者だけを更新する。
  abstract updateContent(articleId: number, content: ArticleContent): StoredArticle;
  // 記事と確定状態を取得する。
  abstract findById(articleId: number): StoredArticle | undefined;
  // 指定された状態の項目だけを保存する。
  abstract updateState(articleId: number, patch: Partial<ArticleState>): StoredArticle | undefined;
}
