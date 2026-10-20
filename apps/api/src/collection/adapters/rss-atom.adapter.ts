import Parser from 'rss-parser';
import type { SourceConfig } from '../../settings/models/source-config';
import { latest, normalizeArticle, record } from '../models/normalize-article';
import { SourceFetchError, type SourceAdapter, type SourceResult } from '../models/source-adapter';
import { SourceHttp } from './source-http';

type Extra = { id?: unknown; author?: unknown; updated?: unknown; published?: unknown; mediaGroup?: unknown };

export class RssAtomAdapter implements SourceAdapter {
  constructor(private readonly http = new SourceHttp()) {}

  async fetch(source: SourceConfig): Promise<SourceResult> {
    const xml = await this.http.get(source.endpoint);
    return this.parse(source, xml);
  }

  async parse(source: SourceConfig, xml: string): Promise<SourceResult> {
    // rss-parserはAtomの日付を内部でtoISOStringする。壊れた任意日付だけ空にして全件失敗を防ぐ。
    const parser = new Parser<Record<string, unknown>, Extra>({
      xml2js: { valueProcessors: [(value: unknown, name: string) => {
        if (['published', 'updated'].includes(name) && typeof value === 'string'
          && !Number.isFinite(new Date(value).getTime())) return '';
        return value;
      }] },
      customFields: { item: ['published', 'updated', ['media:group', 'mediaGroup']] },
    });
    let feed: Awaited<ReturnType<typeof parser.parseString>>;
    try { feed = await parser.parseString(xml); }
    catch { throw new SourceFetchError('format'); }
    const articles = [];
    let skippedItems = 0;
    for (const item of feed.items) {
      const media = record(item.mediaGroup);
      const descriptions = media?.['media:description'];
      const mediaDescription = Array.isArray(descriptions) ? descriptions[0] : undefined;
      const article = normalizeArticle(source.sourceId, {
        id: item.guid ?? item.id, url: item.link, title: item.title,
        description: item.contentSnippet ?? item.summary ?? mediaDescription,
        author: item.creator ?? item.author,
        publishedAt: item.published ?? item.pubDate ?? item.isoDate,
        updatedAt: item.updated,
      });
      if (article) articles.push(article);
      else skippedItems++;
    }
    return { articles: latest(articles, source.maxPerRun), skippedItems };
  }
}
