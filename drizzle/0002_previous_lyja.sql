DROP INDEX `one_running_job_per_owner`;--> statement-breakpoint
CREATE INDEX `jobs_owner_status` ON `jobs` (`owner`,`status`);