import type { ArticleListKind, ArticlePageResponse } from '@it-discovery/contracts';
import type { ArticleListApi } from './article-list-api';

// Modelは取得条件をAPIへ渡して結果を返す。表示する記事やローディングはVMが持つ。
export class ArticleListModel {
  constructor(private readonly api: ArticleListApi) {}
  getPage(kind: ArticleListKind, cursor?: string, signal?: AbortSignal, sourceId?: string): Promise<ArticlePageResponse> {
    return this.api.getArticlePage({ kind, limit: 20, ...(cursor ? { cursor } : {}),
      ...(sourceId !== undefined ? { sourceId } : {}) }, signal);
  }
  getSources(signal?: AbortSignal) { return this.api.getArticleSources(signal); }
}
