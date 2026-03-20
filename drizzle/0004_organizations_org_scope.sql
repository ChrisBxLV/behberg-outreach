CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
);

ALTER TABLE `users` ADD `organizationId` int;
ALTER TABLE `users` ADD `orgMemberRole` enum('owner','member');

ALTER TABLE `contacts` ADD `organizationId` int;
ALTER TABLE `campaigns` ADD `organizationId` int;
