import type { SourceConfig } from './source-config';

// 日本語の技術記事を中心に、海外の発見はHacker Newsの主要フィードから補う。
export const defaultSources: SourceConfig[] = [
  { sourceId: 'zenn', siteName: 'Zenn', endpoint: 'https://zenn.dev/feed', adapterKind: 'rss-atom', iconUrl: null, maxPerRun: 50, enabled: true },
  { sourceId: 'publickey', siteName: 'Publickey', endpoint: 'https://www.publickey1.jp/atom.xml', adapterKind: 'rss-atom', iconUrl: null, maxPerRun: 50, enabled: true },
  { sourceId: 'gihyo', siteName: 'gihyo.jp', endpoint: 'https://gihyo.jp/feed/rss2', adapterKind: 'rss-atom', iconUrl: null, maxPerRun: 50, enabled: true },
  { sourceId: 'hacker_news', siteName: 'Hacker News', endpoint: 'https://news.ycombinator.com/rss', adapterKind: 'rss-atom', iconUrl: null, maxPerRun: 50, enabled: true },
];
