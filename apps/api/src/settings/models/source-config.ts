export interface SourceConfig {
  sourceId: string;
  siteName: string;
  iconUrl: string | null;
  endpoint: string;
  adapterKind: 'rss-atom' | 'github-releases';
  maxPerRun: number;
  enabled: boolean;
}

export interface CollectionSettings {
  unreadRetentionDays: number;
  maxArticles: number;
  collectionHour: number;
  collectionTimezone: string;
}
