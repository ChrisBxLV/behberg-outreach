-- Performance indexes for hot filters / joins / orderings.
--
-- Notes on what is NOT included here (intentional, to avoid redundant indexes):
--   * `email_logs.trackingId` and `email_logs.idempotencyKey` already have
--     unique indexes (`email_logs_trackingId_unique`, `email_logs_idempotency_key_unique`).
--   * Single-column indexes on FK columns whose implicit InnoDB FK index already
--     covers the column are skipped (e.g. `mailbox_oauth_tokens.mailboxId`,
--     `mailbox_webhook_subscriptions.mailboxId`, `prospect_employees.companyId`).
--   * `campaign_contacts.(campaignId)` is covered by the leftmost prefix of the
--     existing UNIQUE `campaign_contacts_campaign_contact_unique (campaignId, contactId)`.
--   * `mailboxes.(organizationId)` is covered by the leftmost prefix of the
--     existing UNIQUE `mailboxes_org_provider_email_unique`.
--   * `prospect_companies.(domain, linkedinUrl)` and
--     `prospect_employees.(linkedinUrl)` already have unique indexes.
--   * `prospect_daily_budget.(bucketDay, bucketKind)` already has a unique index.
--
-- All `CREATE INDEX` statements are idempotent at the migrator level:
-- scripts/mysql-migrate.mjs swallows `ER_DUP_KEYNAME`, so re-running this
-- migration on a database where the index already exists is a no-op.

CREATE INDEX `users_organization_id_idx` ON `users` (`organizationId`);
--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);
--> statement-breakpoint
CREATE INDEX `contacts_organization_id_idx` ON `contacts` (`organizationId`);
--> statement-breakpoint
CREATE INDEX `contacts_email_idx` ON `contacts` (`email`);
--> statement-breakpoint
CREATE INDEX `contacts_updated_at_idx` ON `contacts` (`updatedAt`);
--> statement-breakpoint
CREATE INDEX `contacts_stage_idx` ON `contacts` (`stage`);
--> statement-breakpoint
CREATE INDEX `contacts_email_status_idx` ON `contacts` (`emailStatus`);
--> statement-breakpoint
CREATE INDEX `contacts_normalized_domain_idx` ON `contacts` (`normalizedDomain`);
--> statement-breakpoint
CREATE INDEX `campaigns_organization_id_idx` ON `campaigns` (`organizationId`);
--> statement-breakpoint
CREATE INDEX `campaigns_status_idx` ON `campaigns` (`status`);
--> statement-breakpoint
CREATE INDEX `campaigns_mailbox_id_idx` ON `campaigns` (`mailboxId`);
--> statement-breakpoint
CREATE INDEX `campaign_contacts_contact_id_idx` ON `campaign_contacts` (`contactId`);
--> statement-breakpoint
CREATE INDEX `campaign_contacts_status_idx` ON `campaign_contacts` (`status`);
--> statement-breakpoint
CREATE INDEX `campaign_contacts_next_send_at_idx` ON `campaign_contacts` (`nextSendAt`);
--> statement-breakpoint
CREATE INDEX `campaign_contacts_status_next_send_at_idx` ON `campaign_contacts` (`status`, `nextSendAt`);
--> statement-breakpoint
CREATE INDEX `email_logs_campaign_id_idx` ON `email_logs` (`campaignId`);
--> statement-breakpoint
CREATE INDEX `email_logs_contact_id_idx` ON `email_logs` (`contactId`);
--> statement-breakpoint
CREATE INDEX `email_logs_mailbox_id_idx` ON `email_logs` (`mailboxId`);
--> statement-breakpoint
CREATE INDEX `email_logs_provider_message_id_idx` ON `email_logs` (`providerMessageId`);
--> statement-breakpoint
CREATE INDEX `email_logs_sent_at_idx` ON `email_logs` (`sentAt`);
--> statement-breakpoint
CREATE INDEX `email_logs_replied_at_idx` ON `email_logs` (`repliedAt`);
--> statement-breakpoint
CREATE INDEX `email_logs_reply_sentiment_idx` ON `email_logs` (`replySentiment`);
--> statement-breakpoint
CREATE INDEX `tracking_events_tracking_id_idx` ON `tracking_events` (`trackingId`);
--> statement-breakpoint
CREATE INDEX `tracking_events_created_at_idx` ON `tracking_events` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `login_challenges_email_idx` ON `login_challenges` (`email`);
--> statement-breakpoint
CREATE INDEX `login_challenges_expires_at_idx` ON `login_challenges` (`expiresAt`);
--> statement-breakpoint
CREATE INDEX `login_challenges_used_at_idx` ON `login_challenges` (`usedAt`);
--> statement-breakpoint
CREATE INDEX `login_challenges_email_used_expires_idx` ON `login_challenges` (`email`, `usedAt`, `expiresAt`);
--> statement-breakpoint
CREATE INDEX `mailboxes_email_idx` ON `mailboxes` (`email`);
--> statement-breakpoint
CREATE INDEX `mailbox_webhook_subscriptions_provider_subscription_id_idx` ON `mailbox_webhook_subscriptions` (`providerSubscriptionId`);
--> statement-breakpoint
CREATE INDEX `prospect_companies_status_idx` ON `prospect_companies` (`status`);
--> statement-breakpoint
CREATE INDEX `prospect_companies_industry_code_idx` ON `prospect_companies` (`industryCode`);
--> statement-breakpoint
CREATE INDEX `prospect_companies_hq_country_idx` ON `prospect_companies` (`hqCountry`);
--> statement-breakpoint
CREATE INDEX `prospect_companies_last_enriched_at_idx` ON `prospect_companies` (`lastEnrichedAt`);
--> statement-breakpoint
CREATE INDEX `prospect_companies_name_normalized_idx` ON `prospect_companies` (`nameNormalized`);
--> statement-breakpoint
CREATE INDEX `prospect_employees_email_idx` ON `prospect_employees` (`email`);
--> statement-breakpoint
CREATE INDEX `prospect_employees_email_status_idx` ON `prospect_employees` (`emailStatus`);
--> statement-breakpoint
CREATE INDEX `prospect_employees_first_seen_at_idx` ON `prospect_employees` (`firstSeenAt`);
--> statement-breakpoint
CREATE INDEX `prospect_crawl_queue_status_available_at_idx` ON `prospect_crawl_queue` (`status`, `availableAt`);
--> statement-breakpoint
CREATE INDEX `prospect_crawl_queue_kind_status_idx` ON `prospect_crawl_queue` (`kind`, `status`);
--> statement-breakpoint
CREATE INDEX `prospect_crawl_seeds_enabled_next_run_at_idx` ON `prospect_crawl_seeds` (`enabled`, `nextRunAt`);
--> statement-breakpoint
CREATE INDEX `prospect_crawl_seeds_kind_idx` ON `prospect_crawl_seeds` (`kind`);
--> statement-breakpoint
CREATE INDEX `prospect_host_throttle_next_allowed_at_idx` ON `prospect_host_throttle` (`nextAllowedAt`);
