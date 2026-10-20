import type { SourceConfig } from '../../settings/models/source-config';
import { latest, normalizeArticle, record, text } from '../models/normalize-article';
import { SourceFetchError, type SourceAdapter, type SourceResult } from '../models/source-adapter';
import { SourceHttp } from './source-http';

// APIの近傍だけ調べる。過去全件を遡らず、最大10ページ・各100件の公開日時から最新X件を選ぶ。
export class GitHubReleasesAdapter implements SourceAdapter {
  constructor(private readonly http = new SourceHttp(), private readonly token = process.env['GITHUB_TOKEN']) {}

  async fetch(source: SourceConfig): Promise<SourceResult> {
    let endpoint: URL;
    try { endpoint = new URL(source.endpoint); }
    catch { throw new SourceFetchError('configuration'); }
    // トークンを設定先やリダイレクト先へ無条件に送らない。
    if (endpoint.origin !== 'https://api.github.com' || endpoint.username || endpoint.password
      || !/^\/repos\/[^/]+\/[^/]+\/releases$/.test(endpoint.pathname)) throw new SourceFetchError('configuration');
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const raw: unknown[] = [];
    const pages = Math.min(10, Math.max(1, Math.ceil(source.maxPerRun / 100) + 1));
    for (let page = 1; page <= pages; page++) {
      endpoint.search = new URLSearchParams({ per_page: '100', page: String(page) }).toString();
      const body = await this.http.get(endpoint.href, headers, 'error');
      let parsed: unknown;
      try { parsed = JSON.parse(body); }
      catch { throw new SourceFetchError('format'); }
      if (!Array.isArray(parsed)) throw new SourceFetchError('format');
      raw.push(...parsed);
      if (parsed.length < 100) break;
    }
    return this.parse(source, raw);
  }

  parse(source: SourceConfig, values: unknown[]): SourceResult {
    const articles = [];
    let skippedItems = 0;
    for (const value of values) {
      const item = record(value);
      if (!item || typeof item.draft !== 'boolean' || typeof item.prerelease !== 'boolean') { skippedItems++; continue; }
      if (item.draft) continue;
      // リリースIDはAPIの数値。タイトルを識別に使わず、表示名が空ならタグ名を使う。
      const id = typeof item.id === 'number' && Number.isSafeInteger(item.id) && item.id > 0 ? String(item.id) : null;
      if (!id) { skippedItems++; continue; }
      const article = normalizeArticle(source.sourceId, {
        id, title: text(item.name) ?? item.tag_name, url: item.html_url,
        description: item.body, author: record(item.author)?.login,
        publishedAt: item.published_at, updatedAt: item.updated_at,
      });
      if (article) articles.push(article);
      else skippedItems++;
    }
    return { articles: latest(articles, source.maxPerRun), skippedItems };
  }
}
