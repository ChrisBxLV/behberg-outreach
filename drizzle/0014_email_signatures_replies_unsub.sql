-- Campaign contact terminal states + reason
ALTER TABLE `campaign_contacts` ADD `completionReason` varchar(64);
--> statement-breakpoint
ALTER TABLE `campaign_contacts` MODIFY COLUMN `status` enum(
  'enrolled',
  'active',
  'completed',
  'unsubscribed',
  'bounced',
  'replied',
  'positive_reply'
) NOT NULL DEFAULT 'enrolled';
--> statement-breakpoint
ALTER TABLE `email_logs` ADD `replySentiment` enum(
  'positive',
  'negative',
  'neutral',
  'unsubscribe_intent',
  'unknown'
) NULL;
--> statement-breakpoint
ALTER TABLE `email_logs` ADD `replySnippet` text;
--> statement-breakpoint
ALTER TABLE `mailboxes` ADD `signatureHtml` text;
--> statement-breakpoint
ALTER TABLE `mailboxes` ADD `signatureLogoUrl` varchar(512);
--> statement-breakpoint
CREATE TABLE `mailbox_unsubscribes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `mailboxId` int NOT NULL,
  `recipientEmail` varchar(320) NOT NULL,
  `source` enum('link_click','reply_detected','api') NOT NULL DEFAULT 'link_click',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `mailbox_unsubscribes_id` PRIMARY KEY(`id`),
  CONSTRAINT `mailbox_unsubscribes_mailbox_fk` FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes`(`id`) ON DELETE cascade ON UPDATE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_unsubscribes_mailbox_email_unique` ON `mailbox_unsubscribes` (`mailboxId`, `recipientEmail`);
--> statement-breakpoint
ALTER TABLE `users` ADD `positiveRepliesLastSeenAt` timestamp NULL;
--> statement-breakpoint
