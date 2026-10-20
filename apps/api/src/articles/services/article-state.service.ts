import { Inject, Injectable } from '@nestjs/common';
import type { ArticleState } from '../models/article-state';
import { assertArticleId } from '../validators/article-id.validator';
import { parseStateChange } from '../validators/article-state-change.validator';
import { ArticleRepository } from '../repositories/article.repository';

// ピン・気になる・既読を直接保存する。操作IDの記録・照会・再送管理は行わない。
@Injectable()
export class ArticleStateService {
  constructor(
    @Inject(ArticleRepository) private readonly articles: ArticleRepository,
  ) {}

  getState(articleId: number): ArticleState | undefined {
    assertArticleId(articleId);
    return this.articles.findById(articleId)?.state;
  }

  // 検証後、存在確認と更新を同じトランザクションで行う。記事がなければ作成しない。
  apply(articleId: number, input: unknown): ArticleState | undefined {
    assertArticleId(articleId);
    const change = parseStateChange(input);
    return this.articles.transaction(() => {
      const current = this.articles.findById(articleId);
      if (!current) return undefined;
      if (change.kind === 'opened') {
        const last = current.state.lastOpenedAt;
        // 古い日時や同じ日時の到着で、最後に開いた日時を巻き戻さない。
        if (last && change.openedAt <= last) return current.state;
      }
      const patch: Partial<ArticleState> = change.kind === 'opened'
        ? { lastOpenedAt: change.openedAt }
        : { [change.kind]: change.value };
      const saved = this.articles.updateState(articleId, patch);
      if (!saved) throw new Error('Article state disappeared during transaction');
      return saved.state;
    });
  }
}
