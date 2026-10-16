CREATE TABLE `article_state_operations` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`article_id` integer NOT NULL,
	`status` text NOT NULL,
	`interested` integer,
	`pinned` integer,
	`last_opened_at` integer,
	CONSTRAINT "operation_result_state" CHECK((
    "article_state_operations"."status" = 'saved' AND "article_state_operations"."interested" IS NOT NULL AND "article_state_operations"."pinned" IS NOT NULL
    AND "article_state_operations"."interested" IN (0, 1) AND "article_state_operations"."pinned" IN (0, 1)
  ) OR (
    "article_state_operations"."status" = 'missing' AND "article_state_operations"."interested" IS NULL
    AND "article_state_operations"."pinned" IS NULL AND "article_state_operations"."last_opened_at" IS NULL
  ))
);
