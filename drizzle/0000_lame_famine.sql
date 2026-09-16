CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	`status` text NOT NULL,
	`prompt` text NOT NULL,
	`model` text NOT NULL,
	`image_size` text NOT NULL,
	`aspect_ratio` text NOT NULL,
	`parent_id` text,
	`ref_key` text,
	`ref_mime` text,
	`image_key` text,
	`image_mime` text,
	`width` integer,
	`height` integer,
	`bytes` integer DEFAULT 0 NOT NULL,
	`request_id` text,
	`error_code` text,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `jobs_owner_created` ON `jobs` (`owner`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_expiry` ON `jobs` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_running_job_per_owner` ON `jobs` (`owner`) WHERE "jobs"."status" = 'running';