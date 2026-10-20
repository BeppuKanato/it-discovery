import type { ArticleInput } from '../../articles/models/article';

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function date(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

// URLを正規化して識別を変えない。必須項目が壊れた一件だけ除外し、任意項目はnullにする。
export function normalizeArticle(sourceId: string, raw: Record<string, unknown>): ArticleInput | null {
  const title = text(raw.title);
  const url = text(raw.url);
  if (!title || !url) return null;
  try { if (!['http:', 'https:'].includes(new URL(url).protocol)) return null; }
  catch { return null; }
  return {
    sourceId, title, url, externalArticleId: text(raw.id),
    description: text(raw.description), author: text(raw.author),
    publishedAt: date(raw.publishedAt), sourceUpdatedAt: date(raw.updatedAt),
  };
}

// 日付がない記事も残す。同日時・日付なし同士は元の順序を維持する。
export function latest(articles: ArticleInput[], maximum: number): ArticleInput[] {
  return articles.map((article, index) => ({ article, index }))
    .sort((a, b) => (b.article.publishedAt?.getTime() ?? -Infinity)
      - (a.article.publishedAt?.getTime() ?? -Infinity) || a.index - b.index)
    .slice(0, maximum).map(({ article }) => article);
}
