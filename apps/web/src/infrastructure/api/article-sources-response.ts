import type { ArticleSource } from '@it-discovery/contracts';

// 選択肢の表示名・ID・画像の型を確認し、重複IDを選択肢へ流さない。
export function isArticleSources(value: unknown): value is ArticleSource[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every(source => {
    if (!source || typeof source !== 'object' || typeof source.sourceId !== 'string'
      || !source.sourceId || typeof source.siteName !== 'string' || !source.siteName
      || !(source.iconUrl === null || typeof source.iconUrl === 'string') || ids.has(source.sourceId)) return false;
    ids.add(source.sourceId); return true;
  });
}
