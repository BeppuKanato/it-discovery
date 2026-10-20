import type { ArticleInput } from '../../articles/models/article';
import type { SourceConfig } from '../../settings/models/source-config';

export interface SourceResult {
  articles: ArticleInput[];
  skippedItems: number;
}

// 取得失敗は記事ゼロ件と区別する。生レスポンスや認証情報はログへ流さない。
export class SourceFetchError extends Error {
  constructor(readonly reason: 'network' | 'http' | 'format' | 'configuration', readonly status?: number) {
    super(`Source fetch failed: ${reason}${status === undefined ? '' : ` (${status})`}`);
  }
}

export interface SourceAdapter {
  fetch(source: SourceConfig): Promise<SourceResult>;
}
