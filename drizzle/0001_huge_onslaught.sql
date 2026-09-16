CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` integer NOT NULL,
	`mime` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`sha256` text DEFAULT '' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`legacy_task_id` text,
	`thumb_bytes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_owner` ON `assets` (`owner`);--> statement-breakpoint
CREATE INDEX `assets_legacy` ON `assets` (`legacy_task_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`google_client_id` text DEFAULT '' NOT NULL
);
