import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, or, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { articles, articleStates, sources } from '../../infrastructure/database/schema';
import type { ArticleContent, ArticleIdentity, NewArticle } from '../models/article';
import type { ArticleState } from '../models/article-state';
import { ArticleRepository, type StoredArticle } from './article.repository';
import { toArticle, toArticleState } from './article.mapper';
import type { ArticleListEntry, ArticlePageQuery } from '../models/article-page';

@Injectable()
export class SqliteArticleRepository extends ArticleRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    super();
  }

  // 同期処理をSQLiteのトランザクションで一括確定する。
  transaction<T>(operation: () => T): T {
    return this.database.client.transaction(operation).immediate();
  }

  // 指定された識別条件で記事と状態を検索する。
  findByIdentity(identity: ArticleIdentity): StoredArticle | undefined {
    const row = this.database.db.select({ article: articles, state: articleStates })
      .from(articles).innerJoin(articleStates, eq(articles.articleId, articleStates.articleId))
      .where(and(
        eq(articles.sourceId, identity.sourceId),
        eq(articles.identityKind, identity.kind),
        eq(articles.identityValue, identity.value),
      )).get();
    return row ? { article: toArticle(row.article), state: toArticleState(row.state) } : undefined;
  }

  // 渡された記事と初期状態を一括保存する。
  insert({ input, identity, fetchedAt }: NewArticle): StoredArticle {
    return this.transaction(() => {
      const row = this.database.db.insert(articles).values({
        sourceId: input.sourceId,
        identityKind: identity.kind,
        identityValue: identity.value,
        externalArticleId: input.externalArticleId || null,
        url: input.url,
        title: input.title,
        description: input.description ?? null,
        author: input.author ?? null,
        publishedAt: input.publishedAt ?? null,
        sourceUpdatedAt: input.sourceUpdatedAt ?? null,
        fetchedAt,
      }).returning().get();
      const state = this.database.db.insert(articleStates).values({ articleId: row.articleId })
        .returning().get();
      return { article: toArticle(row), state: toArticleState(state) };
    });
  }

  // 指定されたタイトル・概要・著者を保存する。
  updateContent(articleId: number, content: ArticleContent): StoredArticle {
    return this.transaction(() => {
      this.database.db.update(articles).set(content).where(eq(articles.articleId, articleId)).run();
      const saved = this.findById(articleId);
      if (!saved) throw new Error('Article not found');
      return saved;
    });
  }

  // 記事と状態をIDで取得する。
  findById(articleId: number): StoredArticle | undefined {
    const row = this.database.db.select({ article: articles, state: articleStates })
      .from(articles).innerJoin(articleStates, eq(articles.articleId, articleStates.articleId))
      .where(eq(articles.articleId, articleId)).get();
    return row ? { article: toArticle(row.article), state: toArticleState(row.state) } : undefined;
  }

  // INは指定されたIDのいずれかに一致する条件。記事ごとのSELECTを一つにまとめる。
  findByIds(articleIds: number[]): StoredArticle[] {
    if (articleIds.length === 0) return [];
    const rows = this.database.db.select({ article: articles, state: articleStates })
      .from(articles).innerJoin(articleStates, eq(articles.articleId, articleStates.articleId))
      .where(inArray(articles.articleId, articleIds)).all();
    return rows.map((row) => ({ article: toArticle(row.article), state: toArticleState(row.state) }));
  }

  // 気になるだけを一つのUPDATEで登録する。既読・ピンには触れず、更新後の再取得もしない。
  // Serviceのtransaction内から呼ぶことで、対象の取得と結果記録も含めて一括確定する。
  registerInterests(articleIds: number[]): void {
    if (articleIds.length === 0) return;
    this.database.db.update(articleStates).set({ interested: true })
      .where(inArray(articleStates.articleId, articleIds)).run();
  }

  // 一覧条件と続き位置をSQLへ変換し、指定件数を取得する。
  findPage(query: ArticlePageQuery): ArticleListEntry[] {
    const before = query.before;
    return this.findListEntries(and(
      query.kind === 'interested' ? eq(articleStates.interested, true) : undefined,
      before ? or(
        lt(articles.fetchedAt, before.fetchedAt),
        and(eq(articles.fetchedAt, before.fetchedAt), lt(articles.articleId, before.articleId)),
      ) : undefined,
    ), query.limit);
  }

  // 対象条件をSQLのWHEREへ変換する。全記事を取得してから10件へ切り詰めない。
  findSortingCandidates(limit: number): ArticleListEntry[] {
    return this.findListEntries(and(
      isNull(articleStates.lastOpenedAt), eq(articleStates.interested, false), eq(articleStates.pinned, false),
    ), limit);
  }

  // 一覧と仕分けで、表示情報の結合・並び順・DB形式からの変換を共有する。
  private findListEntries(condition: SQL | undefined, limit: number): ArticleListEntry[] {
    const rows = this.database.db.select({
      article: articles, state: articleStates,
      source: { sourceId: sources.sourceId, siteName: sources.siteName, iconUrl: sources.iconUrl },
    }).from(articles)
      .innerJoin(articleStates, eq(articles.articleId, articleStates.articleId))
      .innerJoin(sources, eq(articles.sourceId, sources.sourceId))
      .where(condition).orderBy(desc(articles.fetchedAt), desc(articles.articleId)).limit(limit).all();
    return rows.map((row) => ({ article: toArticle(row.article), state: toArticleState(row.state), source: row.source }));
  }

  // 削除時にも状態条件をSQLへ含める。呼び出し元のimmediate transaction中は他の書き込みが割り込まない。
  deleteExpired(before: Date): number {
    const ids = this.database.db.select({ id: articles.articleId }).from(articles)
      .innerJoin(articleStates, eq(articles.articleId, articleStates.articleId))
      .where(and(eq(articleStates.interested, false), eq(articleStates.pinned, false),
        isNull(articleStates.lastOpenedAt), lt(articles.fetchedAt, before))).all().map((row) => row.id);
    return this.deleteUnprotected(ids);
  }

  countProtected(): number {
    return this.database.db.select({ total: count() }).from(articleStates)
      .where(or(eq(articleStates.interested, true), eq(articleStates.pinned, true))).get()!.total;
  }

  trimToLimit(maximum: number): number {
    const total = this.database.db.select({ total: count() }).from(articles).get()!.total;
    let remaining = Math.max(0, total - maximum);
    let removed = 0;
    for (const read of [false, true]) {
      if (remaining === 0) break;
      const ids = this.database.db.select({ id: articles.articleId }).from(articles)
        .innerJoin(articleStates, eq(articles.articleId, articleStates.articleId))
        .where(and(eq(articleStates.interested, false), eq(articleStates.pinned, false),
          read ? isNotNull(articleStates.lastOpenedAt) : isNull(articleStates.lastOpenedAt)))
        .orderBy(asc(read ? articleStates.lastOpenedAt : articles.fetchedAt), asc(articles.articleId))
        .limit(remaining).all().map((row) => row.id);
      const deleted = this.deleteUnprotected(ids);
      removed += deleted;
      remaining -= deleted;
    }
    return removed;
  }

  private deleteUnprotected(ids: number[]): number {
    // SQLiteのbind変数上限を越えないよう分割する。同じtransaction内で保護条件を再確認する。
    let removed = 0;
    for (let start = 0; start < ids.length; start += 500) {
      const eligible = this.database.db.select({ id: articleStates.articleId }).from(articleStates)
        .where(and(inArray(articleStates.articleId, ids.slice(start, start + 500)),
          eq(articleStates.interested, false), eq(articleStates.pinned, false)));
      removed += this.database.db.delete(articles).where(inArray(articles.articleId, eligible)).run().changes;
    }
    return removed;
  }

  // 指定された状態の項目を保存する。
  updateState(articleId: number, changes: Partial<ArticleState>): StoredArticle | undefined {
    return this.transaction(() => {
      if (Object.keys(changes).length > 0) {
        this.database.db.update(articleStates).set(changes)
          .where(eq(articleStates.articleId, articleId)).run();
      }
      return this.findById(articleId);
    });
  }
}
