import { Inject, Injectable } from '@nestjs/common';
import type { ArticleContent, ArticleIdentity, ArticleInput } from '../models/article';
import type { ArticleState } from '../models/article-state';
import { ArticleRepository, type StoredArticle } from './article.repository';

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
    const identity: ArticleIdentity = {
      sourceId: input.sourceId,
      kind: input.externalArticleId ? 'id' : 'url',
      value: input.externalArticleId || input.url,
    };
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
