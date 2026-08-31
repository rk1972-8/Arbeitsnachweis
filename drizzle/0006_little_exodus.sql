CREATE TABLE `crm_sync_items` (
	`source_key` text PRIMARY KEY NOT NULL,
	`payload_hash` text NOT NULL,
	`lead_id` text NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_crm_sync_items_lead` ON `crm_sync_items` (`lead_id`);--> statement-breakpoint
CREATE TABLE `crm_sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_started_at` text,
	`last_succeeded_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`merged` integer DEFAULT 0 NOT NULL,
	`initialized` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL
);
