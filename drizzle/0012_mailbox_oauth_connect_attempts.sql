CREATE TABLE `mailbox_oauth_connect_attempts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `attemptId` varchar(64) NOT NULL,
  `state` varchar(128) NOT NULL,
  `provider` enum('google','microsoft') NOT NULL,
  `organizationId` int NOT NULL,
  `userId` int NOT NULL,
  `status` enum('pending','processing','succeeded','failed','cancelled') NOT NULL DEFAULT 'pending',
  `errorCode` varchar(128),
  `errorMessage` text,
  `mailboxId` int,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `mailbox_oauth_connect_attempts_id` PRIMARY KEY(`id`),
  CONSTRAINT `mailbox_oauth_connect_attempts_attempt_unique` UNIQUE(`attemptId`),
  CONSTRAINT `mailbox_oauth_connect_attempts_state_unique` UNIQUE(`state`)
);

ALTER TABLE `mailbox_oauth_connect_attempts`
  ADD CONSTRAINT `mailbox_oauth_connect_attempts_organization_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `mailbox_oauth_connect_attempts_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `mailbox_oauth_connect_attempts_mailbox_fk`
    FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX `mailboxes_org_provider_email_unique`
  ON `mailboxes` (`organizationId`, `provider`, `email`);
