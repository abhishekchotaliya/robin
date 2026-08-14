CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`filename` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` real,
	`height` real,
	`duration_ms` real,
	`source_provider` text NOT NULL,
	`source_meta` text,
	`created_at` text NOT NULL,
	`owner_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assets_project_idx` ON `assets` (`project_id`);--> statement-breakpoint
CREATE TABLE `captions` (
	`project_id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`model` text NOT NULL,
	`words` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`owner_id` text,
	`format_width` integer NOT NULL,
	`format_height` integer NOT NULL,
	`format_fps` integer NOT NULL,
	`template_id` text NOT NULL,
	`voice` text NOT NULL,
	`bgm` text NOT NULL,
	`captions_config` text NOT NULL,
	`last_render` text,
	`master_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`order` integer NOT NULL,
	`text` text NOT NULL,
	`overlay_text` text,
	`media` text NOT NULL,
	`audio` text,
	`transition_out` text NOT NULL,
	`owner_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenes_project_order_idx` ON `scenes` (`project_id`,`order`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`projects_root` text NOT NULL,
	`default_format` text NOT NULL,
	`default_template_id` text NOT NULL,
	`default_voice` text NOT NULL,
	`providers` text NOT NULL,
	`render` text NOT NULL
);
