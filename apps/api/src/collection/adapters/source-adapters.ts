import type { SourceConfig } from '../../settings/models/source-config';
import type { SourceResult } from '../models/source-adapter';
import { SourceFetchError } from '../models/source-adapter';
import { SourceHttp } from './source-http';
import { RssAtomAdapter } from './rss-atom.adapter';
import { GitHubReleasesAdapter } from './github-releases.adapter';

// 収集ジョブに形式ごとの差を見せない。停止時は共通のHTTP通信を中断する。
export class SourceAdapters {
  private readonly rss: RssAtomAdapter;
  private readonly releases: GitHubReleasesAdapter;
  constructor(private readonly http = new SourceHttp()) {
    this.rss = new RssAtomAdapter(http);
    this.releases = new GitHubReleasesAdapter(http);
  }
  fetch(source: SourceConfig): Promise<SourceResult> {
    switch (source.adapterKind) {
      case 'rss-atom': return this.rss.fetch(source);
      case 'github-releases': return this.releases.fetch(source);
      default: return Promise.reject(new SourceFetchError('configuration'));
    }
  }
  close(): void { this.http.close(); }
}
