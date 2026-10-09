import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { articles, articleStates } from '../../database/schema';
import type { ArticleInput } from '../domain/article';
import type { ArticleState } from '../domain/article-state';
import { ArticleRepository, type StoredArticle } from '../domain/article.repository';

@Injectable()
export class SqliteArticleRepository extends ArticleRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    super();
  }

  // 同一記事の取得日時と状態を維持して追加・更新する。
  upsert(input: ArticleInput, fetchedAt = new Date()): StoredArticle {
    if (!input.sourceId.trim() || !input.url.trim() || !input.title.trim()) {
      throw new Error('sourceId, url and title are required');
    }
    for (const value of [fetchedAt, input.publishedAt, input.sourceUpdatedAt]) {
      if (value && !Number.isFinite(value.getTime())) throw new Error('Invalid article date');
    }
    const externalArticleId = input.externalArticleId || null;
    const metadata = {
      externalArticleId, url: input.url, title: input.title,
      description: input.description ?? null, author: input.author ?? null,
      publishedAt: input.publishedAt ?? null, sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    };
    return this.database.db.transaction((tx) => {
      const article = tx.insert(articles).values({
        ...metadata, sourceId: input.sourceId, fetchedAt,
        identityKind: externalArticleId === null ? 'url' : 'id',
        identityValue: externalArticleId ?? input.url,
      }).onConflictDoUpdate({
        target: [articles.sourceId, articles.identityKind, articles.identityValue],
        set: metadata,
      }).returning().get();
      tx.insert(articleStates).values({ articleId: article.articleId }).onConflictDoNothing().run();
      const state = tx.select().from(articleStates)
        .where(eq(articleStates.articleId, article.articleId)).get()!;
      return { article, state };
    }, { behavior: 'immediate' });
  }

  // 記事と状態をIDで取得する。
  findById(articleId: number): StoredArticle | undefined {
    return this.database.db.select({ article: articles, state: articleStates })
      .from(articles).innerJoin(articleStates, eq(articles.articleId, articleStates.articleId))
      .where(eq(articles.articleId, articleId)).get();
  }

  // 指定項目だけを保存し、他の状態を維持する。
  updateState(articleId: number, patch: Partial<ArticleState>): StoredArticle | undefined {
    const changes: Partial<ArticleState> = {};
    if (patch.interested !== undefined) changes.interested = patch.interested;
    if (patch.pinned !== undefined) changes.pinned = patch.pinned;
    if (patch.lastOpenedAt !== undefined) {
      if (patch.lastOpenedAt && !Number.isFinite(patch.lastOpenedAt.getTime())) {
        throw new Error('Invalid lastOpenedAt');
      }
      changes.lastOpenedAt = patch.lastOpenedAt;
    }
    return this.database.db.transaction(() => {
      if (Object.keys(changes).length > 0) {
        this.database.db.update(articleStates).set(changes)
          .where(eq(articleStates.articleId, articleId)).run();
      }
      return this.findById(articleId);
    });
  }
}
