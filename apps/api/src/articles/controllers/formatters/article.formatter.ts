import type { ArticleListItem } from '@it-discovery/contracts';
import type { ArticleListEntry } from '../../models/article-page';

// 一覧と仕分けが同じカード情報を使えるよう、公開する項目と日時の形式をそろえる。
export function toArticleListItem({ article, source, state }: ArticleListEntry): ArticleListItem {
  return {
    articleId: article.articleId,
    url: article.url,
    title: article.title,
    description: article.description ?? null,
    author: article.author ?? null,
    fetchedAt: article.fetchedAt.toISOString(),
    publishedAt: article.publishedAt?.toISOString() ?? null,
    sourceUpdatedAt: article.sourceUpdatedAt?.toISOString() ?? null,
    source: { sourceId: source.sourceId, siteName: source.siteName, iconUrl: source.iconUrl },
    state: { interested: state.interested, pinned: state.pinned,
      lastOpenedAt: state.lastOpenedAt?.toISOString() ?? null },
  };
}
