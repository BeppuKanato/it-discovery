import type { ArticleListItem, ArticlePageResponse } from '@it-discovery/contracts';

export function article(articleId: number): ArticleListItem {
  return {
    articleId, url: `https://example.com/${articleId}`, title: `記事${articleId}`,
    description: null, author: null, fetchedAt: '2026-10-01T00:00:00.000Z',
    publishedAt: null, sourceUpdatedAt: null,
    source: { sourceId: 'zenn', siteName: 'Zenn', iconUrl: null },
    state: { interested: false, pinned: false, lastOpenedAt: null },
  };
}

export function page(ids: number[], nextCursor: string | null = null): ArticlePageResponse {
  return { articles: ids.map(article), nextCursor, hasMore: nextCursor !== null };
}
