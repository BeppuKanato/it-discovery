import type { ArticleSource, ArticlePageRequest, ArticlePageResponse } from '@it-discovery/contracts';

export interface ArticleListApi {
  // 指定した一覧の一ページを取得する。
  getArticlePage(request: ArticlePageRequest, signal?: AbortSignal): Promise<ArticlePageResponse>;
  getArticleSources(signal?: AbortSignal): Promise<ArticleSource[]>;
}
