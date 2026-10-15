import type { SourceConfig } from './source-config';

export const defaultSources: SourceConfig[] = [
  { sourceId: 'zenn', siteName: 'Zenn', endpoint: 'https://zenn.dev/feed', adapterKind: 'rss-atom', iconUrl: null, maxPerRun: 50, enabled: true },
  { sourceId: 'cloudflare_changelog', siteName: 'Cloudflare Changelog', endpoint: 'https://developers.cloudflare.com/changelog/rss/index.xml', adapterKind: 'rss-atom', iconUrl: null, maxPerRun: 50, enabled: true },
  { sourceId: 'youtube_google_developers', siteName: 'Google Developers', endpoint: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw', adapterKind: 'rss-atom', iconUrl: null, maxPerRun: 50, enabled: true },
  { sourceId: 'syntax_podcast', siteName: 'Syntax', endpoint: 'https://feed.syntax.fm/rss', adapterKind: 'rss-atom', iconUrl: null, maxPerRun: 50, enabled: true },
  { sourceId: 'github_workers_sdk_releases', siteName: 'GitHub / cloudflare/workers-sdk', endpoint: 'https://api.github.com/repos/cloudflare/workers-sdk/releases', adapterKind: 'github-releases', iconUrl: null, maxPerRun: 50, enabled: true },
];
