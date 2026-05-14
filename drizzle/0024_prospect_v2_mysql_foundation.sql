-- Per-tenant prospecting foundation: companies, people, CRM, lists, verification log,
-- and search_index_jobs outbox for a future Elasticsearch/OpenSearch indexer.
-- MySQL remains the source of truth; search indexes are rebuildable from these tables.
--
-- FULLTEXT indexes (below) are not represented in drizzle/schema.ts because Drizzle
-- MySQL helpers in this version do not model FULLTEXT cleanly; they are applied here.

CREATE TABLE `companies` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `organizationId` int NOT NULL,
  `name` varchar(256) NOT NULL,
  `nameNormalized` varchar(256) NULL,
  `domain` varchar(255) NULL,
  `website` varchar(512) NULL,
  `linkedinUrl` varchar(512) NULL,
  `industry` varchar(256) NULL,
  `companySize` varchar(64) NULL,
  `headcount` int NULL,
  `country` varchar(128) NULL,
  `city` varchar(128) NULL,
  `source` varchar(64) NULL,
  `confidence` float NULL,
  `lastEnrichedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `companies_organization_id_domain_unique` (`organizationId`, `domain`),
  KEY `companies_organization_id_name_normalized_idx` (`organizationId`, `nameNormalized`),
  KEY `companies_organization_id_industry_idx` (`organizationId`, `industry`),
  KEY `companies_organization_id_country_idx` (`organizationId`, `country`),
  KEY `companies_organization_id_updated_at_id_idx` (`organizationId`, `updatedAt`, `id`),
  KEY `companies_organization_id_linkedin_url_idx` (`organizationId`, `linkedinUrl`),
  CONSTRAINT `companies_organization_id_organizations_id_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `people` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `organizationId` int NOT NULL,
  `companyId` bigint unsigned NULL,
  `firstName` varchar(128) NULL,
  `lastName` varchar(128) NULL,
  `fullName` varchar(256) NULL,
  `title` varchar(256) NULL,
  `titleNormalized` varchar(256) NULL,
  `seniorityLevel` ENUM('unknown', 'c_level', 'head', 'director', 'manager', 'ic') NOT NULL DEFAULT 'unknown',
  `department` varchar(128) NULL,
  `email` varchar(320) NULL,
  `emailDomain` varchar(255) NULL,
  `emailStatus` ENUM(
    'unknown',
    'valid',
    'invalid',
    'catch_all',
    'risky',
    'mx_present',
    'mx_absent'
  ) NOT NULL DEFAULT 'unknown',
  `linkedinUrl` varchar(512) NULL,
  `country` varchar(128) NULL,
  `city` varchar(128) NULL,
  `source` varchar(64) NULL,
  `confidence` float NULL,
  `lastVerifiedAt` timestamp NULL,
  `lastEnrichedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `people_organization_id_email_unique` (`organizationId`, `email`),
  KEY `people_organization_id_company_id_idx` (`organizationId`, `companyId`),
  KEY `people_organization_id_linkedin_url_idx` (`organizationId`, `linkedinUrl`),
  KEY `people_organization_id_email_status_updated_at_id_idx` (`organizationId`, `emailStatus`, `updatedAt`, `id`),
  KEY `people_organization_id_title_normalized_idx` (`organizationId`, `titleNormalized`),
  KEY `people_organization_id_department_idx` (`organizationId`, `department`),
  KEY `people_organization_id_country_idx` (`organizationId`, `country`),
  KEY `people_organization_id_updated_at_id_idx` (`organizationId`, `updatedAt`, `id`),
  KEY `people_email_domain_idx` (`emailDomain`),
  CONSTRAINT `people_organization_id_organizations_id_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `people_company_id_companies_id_fk`
    FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `crm_contacts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `organizationId` int NOT NULL,
  `personId` bigint unsigned NOT NULL,
  `stage` ENUM('new', 'enriched', 'in_sequence', 'replied', 'closed', 'unsubscribed') NOT NULL DEFAULT 'new',
  `notes` text NULL,
  `tags` json NULL,
  `importBatchId` varchar(64) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crm_contacts_organization_id_person_id_unique` (`organizationId`, `personId`),
  KEY `crm_contacts_organization_id_stage_updated_at_id_idx` (`organizationId`, `stage`, `updatedAt`, `id`),
  KEY `crm_contacts_organization_id_import_batch_id_idx` (`organizationId`, `importBatchId`),
  KEY `crm_contacts_person_id_idx` (`personId`),
  CONSTRAINT `crm_contacts_organization_id_organizations_id_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `crm_contacts_person_id_people_id_fk`
    FOREIGN KEY (`personId`) REFERENCES `people` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `lists` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `organizationId` int NOT NULL,
  `name` varchar(256) NOT NULL,
  `createdByUserId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `lists_organization_id_updated_at_id_idx` (`organizationId`, `updatedAt`, `id`),
  KEY `lists_organization_id_name_idx` (`organizationId`, `name`),
  CONSTRAINT `lists_organization_id_organizations_id_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lists_created_by_user_id_users_id_fk`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `list_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `organizationId` int NOT NULL,
  `listId` bigint unsigned NOT NULL,
  `personId` bigint unsigned NULL,
  `companyId` bigint unsigned NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `list_items_list_id_person_id_unique` (`listId`, `personId`),
  KEY `list_items_organization_id_list_id_idx` (`organizationId`, `listId`),
  KEY `list_items_organization_id_person_id_idx` (`organizationId`, `personId`),
  KEY `list_items_organization_id_company_id_idx` (`organizationId`, `companyId`),
  CONSTRAINT `list_items_organization_id_organizations_id_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `list_items_list_id_lists_id_fk`
    FOREIGN KEY (`listId`) REFERENCES `lists` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `list_items_person_id_people_id_fk`
    FOREIGN KEY (`personId`) REFERENCES `people` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `list_items_company_id_companies_id_fk`
    FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `email_verifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `organizationId` int NOT NULL,
  `personId` bigint unsigned NOT NULL,
  `email` varchar(320) NOT NULL,
  `provider` varchar(64) NULL,
  `status` varchar(64) NULL,
  `score` float NULL,
  `mxValid` boolean NULL,
  `smtpValid` boolean NULL,
  `catchAll` boolean NULL,
  `rawResponse` json NULL,
  `checkedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email_verifications_organization_id_person_id_idx` (`organizationId`, `personId`),
  KEY `email_verifications_organization_id_email_idx` (`organizationId`, `email`),
  KEY `email_verifications_organization_id_status_idx` (`organizationId`, `status`),
  KEY `email_verifications_organization_id_checked_at_idx` (`organizationId`, `checkedAt`),
  CONSTRAINT `email_verifications_organization_id_organizations_id_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `email_verifications_person_id_people_id_fk`
    FOREIGN KEY (`personId`) REFERENCES `people` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `search_index_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `entityType` ENUM('person', 'company') NOT NULL,
  `entityId` bigint unsigned NOT NULL,
  `action` ENUM('upsert', 'delete') NOT NULL,
  `status` ENUM('pending', 'processing', 'done', 'failed') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `availableAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lockedAt` timestamp NULL,
  `lockedBy` varchar(128) NULL,
  `errorMessage` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `search_index_jobs_status_available_at_id_idx` (`status`, `availableAt`, `id`),
  KEY `search_index_jobs_entity_type_entity_id_idx` (`entityType`, `entityId`),
  KEY `search_index_jobs_status_locked_at_idx` (`status`, `lockedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `people` ADD FULLTEXT INDEX `people_search_ft` (`fullName`, `email`, `title`);
--> statement-breakpoint
ALTER TABLE `companies` ADD FULLTEXT INDEX `companies_search_ft` (`name`, `domain`, `industry`);
