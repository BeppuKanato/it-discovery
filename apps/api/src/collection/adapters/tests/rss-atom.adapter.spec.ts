import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultSources } from '../../../settings/models/default-sources';
import { RssAtomAdapter } from '../rss-atom.adapter';
import { SourceHttp } from '../source-http';
import { SourceFetchError } from '../../models/source-adapter';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', `${name}.xml`), 'utf8');

describe('RSS・Atomを共通記事へ変換する', () => {
  it.each(['zenn', 'cloudflare', 'youtube', 'podcast'])('%sの実取得サンプルを読み込む', async (name) => {
    const source = { ...defaultSources[0]!, maxPerRun: 2 };
    const result = await new RssAtomAdapter().parse(source, fixture(`${name}-sample`));
    expect(result.articles).toHaveLength(2);
    expect(result.skippedItems).toBe(0);
    expect(result.articles.every((article) => article.title && article.url)).toBe(true);
  });
  it.each(['zenn', 'cloudflare', 'youtube', 'podcast'])('%s: 最新順・件数制限・欠損・同タイトルを扱う', async (name) => {
    const adapter = new RssAtomAdapter();
    const source = { ...defaultSources[0]!, sourceId: name, maxPerRun: 10 };
    const all = await adapter.parse(source, fixture(name));
    expect(all.articles).toHaveLength(3);
    expect(all.skippedItems).toBe(1);
    expect(all.articles[0]?.publishedAt).toEqual(new Date('2026-10-20T00:00:00Z'));
    expect(all.articles[0]?.title).toBe(all.articles[1]?.title);
    expect(all.articles[0]?.externalArticleId).not.toBe(all.articles[1]?.externalArticleId);
    expect(all.articles[2]).toMatchObject({ externalArticleId: null, description: null, publishedAt: null });
    const limited = await adapter.parse({ ...source, maxPerRun: 1 }, fixture(name));
    expect(limited.articles).toEqual(all.articles.slice(0, 1));
    if (name === 'youtube') expect(all.articles[0]).toMatchObject({ description: '動画説明', author: '作者', sourceUpdatedAt: new Date('2026-10-20T01:00:00Z') });
    else expect(all.articles[0]?.url).toContain('?ref=feed');
  });

  it('HTTP失敗・ネットワーク切断・不正XMLと空フィードを区別する', async () => {
    const source = defaultSources[0]!;
    await expect(new RssAtomAdapter(new SourceHttp(async () => new Response('', { status: 500 }))).fetch(source))
      .rejects.toMatchObject({ reason: 'http', status: 500 });
    await expect(new RssAtomAdapter(new SourceHttp(async () => { throw Error('offline'); })).fetch(source))
      .rejects.toMatchObject({ reason: 'network' });
    const adapter = new RssAtomAdapter();
    await expect(adapter.parse(source, '<broken>')).rejects.toBeInstanceOf(SourceFetchError);
    await expect(adapter.parse(source, '<rss version="2.0"><channel><title>empty</title></channel></rss>'))
      .resolves.toEqual({ articles: [], skippedItems: 0 });
  });

  it('Atomの壊れた日付を欠損として扱い、他の記事を失わない', async () => {
    const result = await new RssAtomAdapter().parse(defaultSources[0]!, fixture('youtube'));
    expect(result.articles.at(-1)?.publishedAt).toBeNull();
  });
});
