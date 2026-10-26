import { Inject, Injectable } from '@nestjs/common';
import type { ArticleContent, ArticleInput } from '../models/article';
import { articleIdentity } from '../models/article-identity';
import { isArticleSourceId } from '../validators/article-source';
import type { ArticleState } from '../models/article-state';
import { ArticleRepository, type StoredArticle } from '../repositories/article.repository';
import {
  ARTICLE_PAGE_SIZE, InvalidArticlePageQueryError,
  type ArticlePage, type ArticlePageQuery,
} from '../models/article-page';

@Injectable()
export class ArticleService {
  constructor(@Inject(ArticleRepository) private readonly repository: ArticleRepository) {}

  // 共通形式の記事を検証し、新規登録または内容更新をする。
  register(input: ArticleInput, fetchedAt = new Date()): StoredArticle {
    if (!input.sourceId.trim() || !input.url.trim() || !input.title.trim()) {
      throw new Error('sourceId, url and title are required');
    }
    for (const value of [fetchedAt, input.publishedAt, input.sourceUpdatedAt]) {
      if (value && !Number.isFinite(value.getTime())) throw new Error('Invalid article date');
    }
    const identity = articleIdentity(input);
    const content: ArticleContent = {
      title: input.title,
      description: input.description ?? null,
      author: input.author ?? null,
    };
    return this.repository.transaction(() => {
      const existing = this.repository.findByIdentity(identity);
      if (!existing) return this.repository.insert({ input, identity, fetchedAt });
      return this.repository.updateContent(existing.article.articleId, content);
    });
  }

  // 記事と状態をIDで取得する。
  findById(articleId: number): StoredArticle | undefined {
    return this.repository.findById(articleId);
  }

  // 一覧の条件を検証し、一件先を確認して続き位置を返す。
  getPage(query: ArticlePageQuery): ArticlePage {
    if (!isArticleSourceId(query.sourceId)) {
      throw new InvalidArticlePageQueryError('sourceIdは1〜100文字の取得先IDを指定してください。');
    }
    if (query.kind !== 'all' && query.kind !== 'interested') {
      throw new InvalidArticlePageQueryError('kindはallまたはinterestedを指定してください。');
    }
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > ARTICLE_PAGE_SIZE) {
      throw new InvalidArticlePageQueryError(`limitは1〜${ARTICLE_PAGE_SIZE}の整数を指定してください。`);
    }
    const before = query.before;
    if (before && (!(before.fetchedAt instanceof Date) || !Number.isFinite(before.fetchedAt.getTime())
      || !Number.isSafeInteger(before.articleId) || before.articleId <= 0)) {
      throw new InvalidArticlePageQueryError('cursorの記事日時または記事IDが不正です。');
    }
    const rows = this.repository.findPage({ ...query, limit: query.limit + 1 });
    const hasMore = rows.length > query.limit;
    const articles = rows.slice(0, query.limit);
    const last = articles.at(-1);
    return {
      articles,
      hasMore,
      nextPosition: hasMore && last
        ? { fetchedAt: last.article.fetchedAt, articleId: last.article.articleId }
        : null,
    };
  }

  // 状態の入力を検証して指定項目を保存する。
  updateState(articleId: number, patch: Partial<ArticleState>): StoredArticle | undefined {
    const changes: Partial<ArticleState> = {};
    for (const key of ['interested', 'pinned'] as const) {
      if (patch[key] !== undefined) {
        if (typeof patch[key] !== 'boolean') throw new Error(`Invalid ${key}`);
        changes[key] = patch[key];
      }
    }
    if (patch.lastOpenedAt !== undefined) {
      if (patch.lastOpenedAt && !Number.isFinite(patch.lastOpenedAt.getTime())) {
        throw new Error('Invalid lastOpenedAt');
      }
      changes.lastOpenedAt = patch.lastOpenedAt;
    }
    return this.repository.updateState(articleId, changes);
  }
}
