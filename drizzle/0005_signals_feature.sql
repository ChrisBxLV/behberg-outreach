CREATE TABLE `signal_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`businessType` varchar(64) NOT NULL,
	`selectedTags` json NOT NULL,
	`selectedSignalTypes` json NOT NULL,
	`sourcesEnabled` json NOT NULL,
	`refreshCadenceMinutes` int NOT NULL DEFAULT 30,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signal_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `signal_profiles_organizationId_unique` UNIQUE(`organizationId`)
);
--> statement-breakpoint

CREATE TABLE `signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`source` varchar(120) NOT NULL,
	`externalId` varchar(512) NOT NULL,
	`signalType` varchar(64) NOT NULL,
	`companyName` varchar(256) NOT NULL,
	`headline` text NOT NULL,
	`url` varchar(1024) NOT NULL,
	`tags` json NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`ingestedAt` timestamp NOT NULL DEFAULT (now()),
	`rawPayload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signals_id` PRIMARY KEY(`id`),
	CONSTRAINT `signals_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint

CREATE TABLE `signal_insights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signalId` int NOT NULL,
	`summaryShort` varchar(512) NOT NULL,
	`actionSuggestion` text NOT NULL,
	`reasoning` text,
	`relevanceScore` float NOT NULL DEFAULT 0,
	`vertical` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signal_insights_id` PRIMARY KEY(`id`),
	CONSTRAINT `signal_insights_signalId_unique` UNIQUE(`signalId`)
);
--> statement-breakpoint

CREATE TABLE `signal_ingestion_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`source` varchar(120) NOT NULL,
	`status` enum('started','completed','failed') NOT NULL DEFAULT 'started',
	`fetchedCount` int NOT NULL DEFAULT 0,
	`insertedCount` int NOT NULL DEFAULT 0,
	`summarizedCount` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `signal_ingestion_runs_id` PRIMARY KEY(`id`)
);
