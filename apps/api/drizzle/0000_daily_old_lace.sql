CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`unread_retention_days` integer NOT NULL,
	`max_articles` integer NOT NULL,
	`collection_hour` integer NOT NULL,
	`collection_timezone` text NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("app_settings"."id" = 1),
	CONSTRAINT "settings_positive_retention" CHECK("app_settings"."unread_retention_days" > 0),
	CONSTRAINT "settings_positive_max" CHECK("app_settings"."max_articles" > 0),
	CONSTRAINT "settings_valid_hour" CHECK("app_settings"."collection_hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE TABLE `article_states` (
	`article_id` integer PRIMARY KEY NOT NULL,
	`interested` integer DEFAULT false NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`last_opened_at` integer,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "state_boolean_interested" CHECK("article_states"."interested" IN (0, 1)),
	CONSTRAINT "state_boolean_pinned" CHECK("article_states"."pinned" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`article_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` text NOT NULL,
	`identity_kind` text NOT NULL,
	`identity_value` text NOT NULL,
	`external_article_id` text,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`author` text,
	`published_at` integer,
	`source_updated_at` integer,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`source_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "article_identity_kind" CHECK("articles"."identity_kind" IN ('id', 'url'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_identity` ON `articles` (`source_id`,`identity_kind`,`identity_value`);--> statement-breakpoint
CREATE INDEX `article_order` ON `articles` (`fetched_at`,`article_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`source_id` text PRIMARY KEY NOT NULL,
	`site_name` text NOT NULL,
	`icon_url` text,
	`endpoint` text NOT NULL,
	`adapter_kind` text NOT NULL,
	`max_per_run` integer DEFAULT 50 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	CONSTRAINT "source_positive_limit" CHECK("sources"."max_per_run" > 0),
	CONSTRAINT "source_boolean_enabled" CHECK("sources"."enabled" IN (0, 1)),
	CONSTRAINT "source_adapter_kind" CHECK("sources"."adapter_kind" IN ('rss-atom', 'github-releases'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_endpoint_unique` ON `sources` (`endpoint`);