CREATE TABLE `article_interest_batches` (
	`batch_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`request_key` text NOT NULL,
	`results` text NOT NULL,
	CONSTRAINT "batch_positive_revision" CHECK("article_interest_batches"."revision" > 0)
);
