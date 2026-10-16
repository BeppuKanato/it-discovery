import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
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

  // 一覧条件と続き位置をSQLへ変換し、指定件数を取得する。
  findPage(query: ArticlePageQuery): ArticleListEntry[] {
    const before = query.before;
    const rows = this.database.db.select({
      article: articles,
      state: articleStates,
      source: { sourceId: sources.sourceId, siteName: sources.siteName, iconUrl: sources.iconUrl },
    }).from(articles)
      .innerJoin(articleStates, eq(articles.articleId, articleStates.articleId))
      .innerJoin(sources, eq(articles.sourceId, sources.sourceId))
      .where(and(
        query.kind === 'interested' ? eq(articleStates.interested, true) : undefined,
        before ? or(
          lt(articles.fetchedAt, before.fetchedAt),
          and(eq(articles.fetchedAt, before.fetchedAt), lt(articles.articleId, before.articleId)),
        ) : undefined,
      ))
      .orderBy(desc(articles.fetchedAt), desc(articles.articleId))
      .limit(query.limit).all();
    return rows.map((row) => ({ article: toArticle(row.article), state: toArticleState(row.state), source: row.source }));
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

