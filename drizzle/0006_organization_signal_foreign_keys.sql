-- Referential integrity for multi-tenant organizationId columns.
-- Legacy `users`, `contacts`, and `campaigns` intentionally allow NULL organizationId
-- (platform admins and pre-scope rows). Non-NULL values must reference `organizations.id`.
-- Signal tables require a valid organization for every row; invalid references are removed below.

--> statement-breakpoint
UPDATE `users` u
LEFT JOIN `organizations` o ON u.organizationId = o.id
SET u.organizationId = NULL
WHERE u.organizationId IS NOT NULL AND o.id IS NULL;
--> statement-breakpoint
UPDATE `contacts` c
LEFT JOIN `organizations` o ON c.organizationId = o.id
SET c.organizationId = NULL
WHERE c.organizationId IS NOT NULL AND o.id IS NULL;
--> statement-breakpoint
UPDATE `campaigns` c
LEFT JOIN `organizations` o ON c.organizationId = o.id
SET c.organizationId = NULL
WHERE c.organizationId IS NOT NULL AND o.id IS NULL;
--> statement-breakpoint
DELETE si FROM `signal_insights` si
LEFT JOIN `signals` s ON si.signalId = s.id
WHERE s.id IS NULL;
--> statement-breakpoint
DELETE si FROM `signal_insights` si
INNER JOIN `signals` s ON si.signalId = s.id
LEFT JOIN `organizations` o ON s.organizationId = o.id
WHERE o.id IS NULL;
--> statement-breakpoint
DELETE s FROM `signals` s
LEFT JOIN `organizations` o ON s.organizationId = o.id
WHERE o.id IS NULL;
--> statement-breakpoint
DELETE sp FROM `signal_profiles` sp
LEFT JOIN `organizations` o ON sp.organizationId = o.id
WHERE o.id IS NULL;
--> statement-breakpoint
DELETE r FROM `signal_ingestion_runs` r
LEFT JOIN `organizations` o ON r.organizationId = o.id
WHERE o.id IS NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE `signal_profiles` ADD CONSTRAINT `signal_profiles_organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE `signals` ADD CONSTRAINT `signals_organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE `signal_ingestion_runs` ADD CONSTRAINT `signal_ingestion_runs_organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE `signal_insights` ADD CONSTRAINT `signal_insights_signal_id_fk` FOREIGN KEY (`signalId`) REFERENCES `signals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
