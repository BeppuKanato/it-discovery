import type { Article, ArticleContent, ArticleIdentity, NewArticle } from '../models/article';
import type { ArticleState } from '../models/article-state';
import type { ArticleListEntry, ArticlePageQuery } from '../models/article-page';

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
  // 指定された記事と状態をまとめて取得する。存在しないIDは結果に含めない。順序は保証しない。
  abstract findByIds(articleIds: number[]): StoredArticle[];
  // 指定された記事の気になる登録だけをまとめて変更する。空配列では何もしない。
  abstract registerInterests(articleIds: number[]): void;
  // 指定位置より古い記事を取得日時とIDの降順で取得する。
  abstract findPage(query: ArticlePageQuery): ArticleListEntry[];
  // 未読・気になる未登録・ピンなしの全対象から、無作為に重複なく抽出する。
  abstract findSortingCandidates(limit: number): ArticleListEntry[];
  // 未読・未保護で期限より古い記事と状態を削除する。
  abstract deleteExpired(before: Date): number;
  // 保護記事数を数える。
  abstract countProtected(): number;
  // 上限超過分を未保護の未読→既読の優先順で削除する。
  abstract trimToLimit(maximum: number): number;
  // 指定された状態の項目だけを保存する。
  abstract updateState(articleId: number, patch: Partial<ArticleState>): StoredArticle | undefined;
}
