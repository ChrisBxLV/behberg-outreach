-- Email log idempotency (scheduler / retry deduplication)
ALTER TABLE `email_logs` ADD `idempotencyKey` varchar(256) NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `email_logs_idempotency_key_unique` ON `email_logs` (`idempotencyKey`);
