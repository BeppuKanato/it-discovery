-- 旧デフォルトの収集だけを一度停止する。記事・ピン・気になるの記録は削除しない。
-- 新しい3取得先はSettingsService.initializeが追加する。以後の起動で設定を上書きしない。
UPDATE sources SET enabled = 0
WHERE source_id IN (
  'cloudflare_changelog', 'youtube_google_developers', 'syntax_podcast', 'github_workers_sdk_releases'
);
