CREATE TABLE `work_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`report_number` text,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`customer_id` text NOT NULL,
	`customer_company` text DEFAULT '' NOT NULL,
	`customer_name` text DEFAULT '' NOT NULL,
	`customer_email` text DEFAULT '' NOT NULL,
	`customer_address` text DEFAULT '' NOT NULL,
	`work_date` text NOT NULL,
	`work_address` text DEFAULT '' NOT NULL,
	`work_minutes` integer DEFAULT 0 NOT NULL,
	`drive_minutes` integer DEFAULT 0 NOT NULL,
	`distance_km` real DEFAULT 0 NOT NULL,
	`work_description` text DEFAULT '' NOT NULL,
	`findings` text DEFAULT '' NOT NULL,
	`complaints` text DEFAULT '' NOT NULL,
	`recommendations` text DEFAULT '' NOT NULL,
	`internal_notes` text DEFAULT '' NOT NULL,
	`personnel_json` text DEFAULT '[]' NOT NULL,
	`positions_json` text DEFAULT '[]' NOT NULL,
	`signer_name` text DEFAULT '' NOT NULL,
	`signature_key` text,
	`pdf_key` text,
	`sent_to` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_work_reports_number` ON `work_reports` (`report_number`);--> statement-breakpoint
CREATE INDEX `idx_work_reports_owner_updated` ON `work_reports` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_work_reports_customer` ON `work_reports` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_work_reports_status` ON `work_reports` (`status`);--> statement-breakpoint
PRAGMA optimize;
