CREATE TABLE `campaign_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`contactId` int NOT NULL,
	`status` enum('enrolled','active','completed','unsubscribed','bounced','replied') NOT NULL DEFAULT 'enrolled',
	`currentStep` int DEFAULT 0,
	`enrolledAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`nextSendAt` timestamp,
	CONSTRAINT `campaign_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`status` enum('draft','active','paused','completed') NOT NULL DEFAULT 'draft',
	`fromName` varchar(128) DEFAULT 'Behberg',
	`fromEmail` varchar(320) DEFAULT 'outreach@behberg.com',
	`replyTo` varchar(320),
	`totalContacts` int DEFAULT 0,
	`sentCount` int DEFAULT 0,
	`openCount` int DEFAULT 0,
	`replyCount` int DEFAULT 0,
	`bounceCount` int DEFAULT 0,
	`notifiedAt100Sent` boolean DEFAULT false,
	`notifiedHighReply` boolean DEFAULT false,
	`notifiedBounce` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`firstName` varchar(128),
	`lastName` varchar(128),
	`fullName` varchar(256),
	`email` varchar(320),
	`emailConfidence` float,
	`emailStatus` enum('unknown','valid','invalid','catch_all','risky') DEFAULT 'unknown',
	`title` varchar(256),
	`company` varchar(256),
	`industry` varchar(256),
	`companySize` varchar(64),
	`companyWebsite` varchar(512),
	`linkedinUrl` varchar(512),
	`location` varchar(256),
	`stage` enum('new','enriched','in_sequence','replied','closed','unsubscribed') NOT NULL DEFAULT 'new',
	`notes` text,
	`tags` json DEFAULT ('[]'),
	`source` varchar(64) DEFAULT 'csv_import',
	`importBatchId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`contactId` int NOT NULL,
	`sequenceStepId` int,
	`campaignContactId` int,
	`subject` varchar(512),
	`body` text,
	`fromEmail` varchar(320),
	`toEmail` varchar(320),
	`status` enum('queued','sent','failed','bounced') NOT NULL DEFAULT 'queued',
	`trackingId` varchar(64),
	`openedAt` timestamp,
	`openCount` int DEFAULT 0,
	`repliedAt` timestamp,
	`bouncedAt` timestamp,
	`errorMessage` text,
	`sentAt` timestamp,
	`scheduledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_logs_trackingId_unique` UNIQUE(`trackingId`)
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` varchar(64) NOT NULL,
	`filename` varchar(256),
	`totalRows` int DEFAULT 0,
	`importedRows` int DEFAULT 0,
	`skippedRows` int DEFAULT 0,
	`status` enum('processing','completed','failed') DEFAULT 'processing',
	`errorLog` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `import_batches_batchId_unique` UNIQUE(`batchId`)
);
--> statement-breakpoint
CREATE TABLE `sequence_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`stepOrder` int NOT NULL,
	`stepType` enum('initial','follow_up','last_notice','opened_no_reply') NOT NULL,
	`subject` varchar(512) NOT NULL,
	`bodyTemplate` text NOT NULL,
	`delayDays` int DEFAULT 0,
	`delayHours` int DEFAULT 0,
	`condition` enum('always','not_opened','opened_no_reply','not_replied') DEFAULT 'always',
	`useLlmPersonalization` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sequence_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sheets_sync` (
	`id` int AUTO_INCREMENT NOT NULL,
	`spreadsheetId` varchar(256),
	`spreadsheetName` varchar(256),
	`sheetName` varchar(128) DEFAULT 'Contacts',
	`accessToken` text,
	`refreshToken` text,
	`tokenExpiry` bigint,
	`lastSyncAt` timestamp,
	`lastSyncDirection` enum('push','pull'),
	`syncStatus` enum('idle','syncing','error') DEFAULT 'idle',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sheets_sync_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tracking_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trackingId` varchar(64) NOT NULL,
	`eventType` enum('open','click','bounce','reply') NOT NULL,
	`ipAddress` varchar(64),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tracking_events_id` PRIMARY KEY(`id`)
);
