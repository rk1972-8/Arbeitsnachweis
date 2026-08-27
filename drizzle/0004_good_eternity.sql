CREATE TABLE `plenty_order_drafts` (
	`report_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`customer_reference` text DEFAULT '' NOT NULL,
	`billing_address_json` text DEFAULT '{}' NOT NULL,
	`delivery_same_as_billing` integer DEFAULT 1 NOT NULL,
	`delivery_address_json` text DEFAULT '{}' NOT NULL,
	`positions_json` text DEFAULT '[]' NOT NULL,
	`plenty_order_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plenty_order_drafts_status_updated` ON `plenty_order_drafts` (`status`,`updated_at`);