import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceConfig } from '../../../settings/models/source-config';
import { GitHubReleasesAdapter } from '../github-releases.adapter';
import { SourceHttp } from '../source-http';
const source: SourceConfig = { sourceId: 'github_test', siteName: 'GitHub test', endpoint: 'https://api.github.com/repos/cloudflare/workers-sdk/releases', adapterKind: 'github-releases', iconUrl: null, maxPerRun: 2, enabled: true };
const sample = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'releases.json'), 'utf8')) as unknown[];

describe('GitHub Releases adapter', () => {
  it('公開日時で最新側を選び、prereleaseを含めdraftを除外し、タグへ代替する', () => {
    const result = new GitHubReleasesAdapter().parse(source, sample);
    expect(result.articles.map((article) => article.externalArticleId)).toEqual(['12', '11']);
    expect(result.articles[0]).toMatchObject({ title: 'v2-beta', description: null, author: 'sample', sourceUpdatedAt: new Date('2026-10-20T01:00:00Z') });
    expect(result.skippedItems).toBe(1);
    expect(new GitHubReleasesAdapter().parse(source, sample)).toEqual(result);
  });
  it('空配列とHTTP失敗・不正レスポンスを区別する', async () => {
    await expect(new GitHubReleasesAdapter(new SourceHttp(async () => Response.json([]))).fetch(source))
      .resolves.toEqual({ articles: [], skippedItems: 0 });
    for (const status of [403, 429, 500]) {
      await expect(new GitHubReleasesAdapter(new SourceHttp(async () => new Response('', { status }))).fetch(source))
        .rejects.toMatchObject({ reason: 'http', status });
    }
    await expect(new GitHubReleasesAdapter(new SourceHttp(async () => Response.json({ message: 'bad' }))).fetch(source))
      .rejects.toMatchObject({ reason: 'format' });
  });
  it('ページ数を限定し、外部ホストへトークンを送らない', async () => {
    const transport = jest.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(Array(100).fill(sample[0])));
    await new GitHubReleasesAdapter(new SourceHttp(transport), 'test-token').fetch(source);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0]?.[0]).toContain('page=1');
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ headers: { Authorization: 'Bearer test-token' }, redirect: 'error' });
    await expect(new GitHubReleasesAdapter(new SourceHttp(transport), 'test-token')
      .fetch({ ...source, endpoint: 'https://example.com/repos/a/b/releases' })).rejects.toMatchObject({ reason: 'configuration' });
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
