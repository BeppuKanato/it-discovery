import { Inject, Injectable } from '@nestjs/common';
import type { ArticleInput } from '../models/article';
import { articleIdentity } from '../models/article-identity';
import { ArticleRepository } from '../repositories/article.repository';
import { ArticleService } from './article.service';

export interface RetentionPolicy { unreadRetentionDays: number; maxArticles: number }
export type CollectionSave = 'added' | 'updated' | 'capacity';

@Injectable()
export class ArticleRetentionService {
  constructor(
    @Inject(ArticleRepository) private readonly repository: ArticleRepository,
    @Inject(ArticleService) private readonly articles: ArticleService,
  ) {}

  // 収集の冒頭で期限と上限を見直す。保護だけで超過する場合は超過を許容する。
  sweep(policy: RetentionPolicy, now = new Date()): number {
    const before = this.expiry(policy, now);
    return this.repository.transaction(() => this.repository.deleteExpired(before)
      + this.repository.trimToLimit(policy.maxArticles));
  }

  save(input: ArticleInput, policy: RetentionPolicy, fetchedAt = new Date()): CollectionSave {
    const before = this.expiry(policy, fetchedAt);
    // ネットワークはこの外で済ませる。再照合・期限削除・追加可否・挿入・上限削除を一括確定する。
    return this.repository.transaction(() => {
      if (this.repository.findByIdentity(articleIdentity(input))) {
        this.articles.register(input, fetchedAt);
        return 'updated';
      }
      this.repository.deleteExpired(before);
      if (this.repository.countProtected() >= policy.maxArticles) return 'capacity';
      this.articles.register(input, fetchedAt);
      this.repository.trimToLimit(policy.maxArticles);
      return 'added';
    });
  }

  private expiry(policy: RetentionPolicy, now: Date): Date {
    if (!Number.isSafeInteger(policy.maxArticles) || policy.maxArticles <= 0
      || !Number.isSafeInteger(policy.unreadRetentionDays) || policy.unreadRetentionDays <= 0
      || !Number.isFinite(now.getTime())) throw new Error('Invalid retention policy');
    const before = new Date(now.getTime() - policy.unreadRetentionDays * 86_400_000);
    if (!Number.isFinite(before.getTime())) throw new Error('Invalid retention period');
    return before;
  }
}
