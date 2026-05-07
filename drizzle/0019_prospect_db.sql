-- Autonomous prospect database (companies, employees, email patterns, crawler queue)

CREATE TABLE `industries` (
  `code` varchar(64) NOT NULL,
  `label` varchar(128) NOT NULL,
  `parentCode` varchar(64) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `prospect_companies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(256) NOT NULL,
  `nameNormalized` varchar(256) NOT NULL,
  `domain` varchar(255) NULL,
  `hqCountry` varchar(2) NULL,
  `hqAdmin1` varchar(8) NULL,
  `hqCity` varchar(128) NULL,
  `headcount` int NULL,
  `headcountBand` varchar(16) NULL,
  `industryCode` varchar(64) NULL,
  `subIndustryCode` varchar(64) NULL,
  `linkedinUrl` varchar(512) NULL,
  `websiteVerified` boolean NOT NULL DEFAULT false,
  `source` varchar(32) NOT NULL DEFAULT 'unknown',
  `sourceEvidenceUrl` varchar(1024) NULL,
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `firstSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastEnrichedAt` timestamp NULL,
  `lastVerifiedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospect_companies_domain_unique` (`domain`),
  UNIQUE KEY `prospect_companies_linkedin_unique` (`linkedinUrl`),
  KEY `prospect_companies_country_admin1_idx` (`hqCountry`, `hqAdmin1`),
  KEY `prospect_companies_industry_idx` (`industryCode`),
  KEY `prospect_companies_status_idx` (`status`),
  FULLTEXT KEY `prospect_companies_name_fulltext` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `prospect_employees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `firstName` varchar(128) NULL,
  `lastName` varchar(128) NULL,
  `fullName` varchar(256) NOT NULL,
  `title` varchar(256) NULL,
  `titleNormalized` varchar(256) NULL,
  `seniorityLevel` varchar(16) NOT NULL DEFAULT 'unknown',
  `locationCountry` varchar(2) NULL,
  `locationAdmin1` varchar(8) NULL,
  `locationCity` varchar(128) NULL,
  `linkedinUrl` varchar(512) NULL,
  `email` varchar(320) NULL,
  `emailPattern` varchar(32) NULL,
  `emailStatus` varchar(16) NOT NULL DEFAULT 'unknown',
  `emailGuesses` json NULL,
  `source` varchar(32) NOT NULL DEFAULT 'unknown',
  `sourceEvidenceUrl` varchar(1024) NULL,
  `firstSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastVerifiedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospect_employees_linkedin_unique` (`linkedinUrl`),
  UNIQUE KEY `prospect_employees_company_fullname_unique` (`companyId`, `fullName`),
  KEY `prospect_employees_seniority_idx` (`seniorityLevel`),
  KEY `prospect_employees_country_idx` (`locationCountry`),
  FULLTEXT KEY `prospect_employees_fullname_title_fulltext` (`fullName`, `title`),
  CONSTRAINT `prospect_employees_company_fk`
    FOREIGN KEY (`companyId`) REFERENCES `prospect_companies` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `prospect_email_patterns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `pattern` varchar(32) NOT NULL,
  `observedCount` int NOT NULL DEFAULT 0,
  `firstSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospect_email_patterns_company_pattern_unique` (`companyId`, `pattern`),
  CONSTRAINT `prospect_email_patterns_company_fk`
    FOREIGN KEY (`companyId`) REFERENCES `prospect_companies` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `prospect_crawl_seeds` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kind` varchar(32) NOT NULL,
  `region` varchar(16) NOT NULL DEFAULT 'global',
  `payload` json NULL,
  `frequencyMinutes` int NOT NULL DEFAULT 360,
  `enabled` boolean NOT NULL DEFAULT true,
  `consecutiveErrors` int NOT NULL DEFAULT 0,
  `lastRunAt` timestamp NULL,
  `nextRunAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `prospect_crawl_seeds_kind_region_idx` (`kind`, `region`),
  KEY `prospect_crawl_seeds_due_idx` (`enabled`, `nextRunAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `prospect_crawl_runs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `seedId` int NULL,
  `kind` varchar(32) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'ok',
  `itemsFound` int NOT NULL DEFAULT 0,
  `itemsNew` int NOT NULL DEFAULT 0,
  `errorMessage` text NULL,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finishedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `prospect_crawl_runs_seed_idx` (`seedId`, `startedAt`),
  CONSTRAINT `prospect_crawl_runs_seed_fk`
    FOREIGN KEY (`seedId`) REFERENCES `prospect_crawl_seeds` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `prospect_crawl_queue` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `kind` varchar(32) NOT NULL,
  `payload` json NOT NULL,
  `priority` int NOT NULL DEFAULT 0,
  `availableAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `attempts` int NOT NULL DEFAULT 0,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `lockedBy` varchar(64) NULL,
  `lockedAt` timestamp NULL,
  `errorMessage` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `prospect_crawl_queue_dispatch_idx` (`status`, `kind`, `availableAt`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `prospect_host_throttle` (
  `host` varchar(255) NOT NULL,
  `nextAllowedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `consecutiveErrors` int NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`host`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `prospect_daily_budget` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bucketDay` varchar(10) NOT NULL,
  `bucketKind` varchar(16) NOT NULL,
  `consumed` int NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `prospect_daily_budget_day_kind_unique` (`bucketDay`, `bucketKind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
