CREATE TABLE `personnel_preferences` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`employee_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'Kältemechatroniker' NOT NULL,
	`updated_at` text NOT NULL
);
