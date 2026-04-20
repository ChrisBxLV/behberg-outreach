CREATE TABLE `mailboxes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `organizationId` int NOT NULL,
  `connectedByUserId` int,
  `provider` enum('google','microsoft','smtp') NOT NULL,
  `email` varchar(320) NOT NULL,
  `displayName` varchar(200),
  `status` enum('connected','reauth_required','error','disabled') NOT NULL DEFAULT 'connected',
  `isDefault` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `mailboxes_id` PRIMARY KEY(`id`)
);

CREATE TABLE `mailbox_oauth_tokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `mailboxId` int NOT NULL,
  `encryptedAccessToken` text,
  `encryptedRefreshToken` text,
  `encryptedSmtpPassword` text,
  `smtpHost` varchar(256),
  `smtpPort` int,
  `smtpSecure` boolean NOT NULL DEFAULT false,
  `smtpUsername` varchar(320),
  `accessTokenExpiresAt` timestamp,
  `scopes` text,
  `providerAccountId` varchar(256),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `mailbox_oauth_tokens_id` PRIMARY KEY(`id`)
);

CREATE TABLE `mailbox_health` (
  `id` int AUTO_INCREMENT NOT NULL,
  `mailboxId` int NOT NULL,
  `lastSuccessAt` timestamp,
  `lastErrorAt` timestamp,
  `errorCode` varchar(128),
  `errorMessage` text,
  `reauthRequired` boolean NOT NULL DEFAULT false,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `mailbox_health_id` PRIMARY KEY(`id`),
  CONSTRAINT `mailbox_health_mailbox_unique` UNIQUE(`mailboxId`)
);

CREATE TABLE `mailbox_send_limits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `mailboxId` int NOT NULL,
  `dailyLimit` int NOT NULL DEFAULT 250,
  `hourlyLimit` int NOT NULL DEFAULT 40,
  `timezone` varchar(64) NOT NULL DEFAULT 'UTC',
  `warmupProfile` json,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `mailbox_send_limits_id` PRIMARY KEY(`id`),
  CONSTRAINT `mailbox_send_limits_mailbox_unique` UNIQUE(`mailboxId`)
);

CREATE TABLE `mailbox_webhook_subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `mailboxId` int NOT NULL,
  `providerSubscriptionId` varchar(256) NOT NULL,
  `status` enum('active','expired','error') NOT NULL DEFAULT 'active',
  `expiresAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `mailbox_webhook_subscriptions_id` PRIMARY KEY(`id`)
);

ALTER TABLE `campaigns`
  ADD COLUMN `mailboxId` int AFTER `replyTo`;

ALTER TABLE `email_logs`
  ADD COLUMN `mailboxId` int AFTER `campaignContactId`,
  ADD COLUMN `providerMessageId` varchar(256) AFTER `status`,
  ADD COLUMN `providerThreadId` varchar(256) AFTER `providerMessageId`;

ALTER TABLE `mailboxes`
  ADD CONSTRAINT `mailboxes_organization_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `mailboxes_connected_by_user_fk`
    FOREIGN KEY (`connectedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `mailbox_oauth_tokens`
  ADD CONSTRAINT `mailbox_oauth_tokens_mailbox_fk`
    FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mailbox_health`
  ADD CONSTRAINT `mailbox_health_mailbox_fk`
    FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mailbox_send_limits`
  ADD CONSTRAINT `mailbox_send_limits_mailbox_fk`
    FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mailbox_webhook_subscriptions`
  ADD CONSTRAINT `mailbox_webhook_subscriptions_mailbox_fk`
    FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
