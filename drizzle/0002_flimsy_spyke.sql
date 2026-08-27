CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`job_role` text DEFAULT 'Kältemechatroniker' NOT NULL,
	`pin_hash` text NOT NULL,
	`pin_salt` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_users_name` ON `app_users` (`name`);--> statement-breakpoint
CREATE INDEX `idx_app_users_active_name` ON `app_users` (`active`,`name`);--> statement-breakpoint
CREATE TABLE `auth_attempts` (
	`attempt_key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_started` text NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
CREATE TABLE `report_additions` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'Stück' NOT NULL,
	`title` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`added_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_report_additions_report` ON `report_additions` (`report_id`,`created_at`);