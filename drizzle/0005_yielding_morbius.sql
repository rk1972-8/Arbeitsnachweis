CREATE TABLE `crm_lead_events` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`channel` text DEFAULT 'Notiz' NOT NULL,
	`note` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_crm_lead_events_lead_time` ON `crm_lead_events` (`lead_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `crm_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'Manuell' NOT NULL,
	`source_reference` text,
	`incoming_at` text NOT NULL,
	`status` text DEFAULT 'Neu' NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`internal_notes` text DEFAULT '' NOT NULL,
	`appointment_at` text,
	`assignee` text DEFAULT '' NOT NULL,
	`first_name` text DEFAULT '' NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`phone_normalized` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`email_normalized` text DEFAULT '' NOT NULL,
	`name_normalized` text DEFAULT '' NOT NULL,
	`street` text DEFAULT '' NOT NULL,
	`house_number` text DEFAULT '' NOT NULL,
	`zip` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`interest` text DEFAULT '' NOT NULL,
	`manufacturer` text DEFAULT '' NOT NULL,
	`rooms` text DEFAULT '' NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`contact_count` integer DEFAULT 1 NOT NULL,
	`last_contact_at` text NOT NULL,
	`google_contact_id` text,
	`google_exported_at` text,
	`google_export_error` text,
	`plenty_contact_id` text,
	`plenty_address_id` text,
	`plenty_exported_at` text,
	`plenty_export_error` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_crm_leads_status_contact` ON `crm_leads` (`status`,`last_contact_at`);--> statement-breakpoint
CREATE INDEX `idx_crm_leads_phone` ON `crm_leads` (`phone_normalized`);--> statement-breakpoint
CREATE INDEX `idx_crm_leads_email` ON `crm_leads` (`email_normalized`);--> statement-breakpoint
CREATE INDEX `idx_crm_leads_name` ON `crm_leads` (`name_normalized`);--> statement-breakpoint
CREATE INDEX `idx_crm_leads_assignee` ON `crm_leads` (`assignee`);