import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sources = sqliteTable('sources', {
  sourceId: text('source_id').primaryKey(),
  siteName: text('site_name').notNull(),
  iconUrl: text('icon_url'),
  endpoint: text('endpoint').notNull().unique(),
  adapterKind: text('adapter_kind', { enum: ['rss-atom', 'github-releases'] }).notNull(),
  maxPerRun: integer('max_per_run').notNull().default(50),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
}, (table) => [
  check('source_positive_limit', sql`${table.maxPerRun} > 0`),
  check('source_boolean_enabled', sql`${table.enabled} IN (0, 1)`),
  check('source_adapter_kind', sql`${table.adapterKind} IN ('rss-atom', 'github-releases')`),
]);

export const articles = sqliteTable('articles', {
  articleId: integer('article_id').primaryKey({ autoIncrement: true }),
  sourceId: text('source_id').notNull().references(() => sources.sourceId),
  identityKind: text('identity_kind', { enum: ['id', 'url'] }).notNull(),
  identityValue: text('identity_value').notNull(),
  externalArticleId: text('external_article_id'),
  url: text('url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  author: text('author'),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  sourceUpdatedAt: integer('source_updated_at', { mode: 'timestamp_ms' }),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  uniqueIndex('article_identity').on(table.sourceId, table.identityKind, table.identityValue),
  index('article_order').on(table.fetchedAt, table.articleId),
  check('article_identity_kind', sql`${table.identityKind} IN ('id', 'url')`),
]);

export const articleStates = sqliteTable('article_states', {
  articleId: integer('article_id').primaryKey().references(() => articles.articleId, { onDelete: 'cascade' }),
  interested: integer('interested', { mode: 'boolean' }).notNull().default(false),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  lastOpenedAt: integer('last_opened_at', { mode: 'timestamp_ms' }),
}, (table) => [
  check('state_boolean_interested', sql`${table.interested} IN (0, 1)`),
  check('state_boolean_pinned', sql`${table.pinned} IN (0, 1)`),
]);

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey(),
  unreadRetentionDays: integer('unread_retention_days').notNull(),
  maxArticles: integer('max_articles').notNull(),
  collectionHour: integer('collection_hour').notNull(),
  collectionTimezone: text('collection_timezone').notNull(),
}, (table) => [
  check('settings_singleton', sql`${table.id} = 1`),
  check('settings_positive_retention', sql`${table.unreadRetentionDays} > 0`),
  check('settings_positive_max', sql`${table.maxArticles} > 0`),
  check('settings_valid_hour', sql`${table.collectionHour} BETWEEN 0 AND 23`),
]);
