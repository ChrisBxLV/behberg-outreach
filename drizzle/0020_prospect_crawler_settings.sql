-- Singleton platform settings for the autonomous Prospect DB crawler (superadmin-tunable).

CREATE TABLE `prospect_crawler_settings` (
  `id` int NOT NULL DEFAULT 1,
  `crawlerEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `dataMode` varchar(32) NOT NULL DEFAULT 'company_safe',
  `dailyHttpBudget` int NOT NULL DEFAULT 50,
  `maxPerTick` int NOT NULL DEFAULT 5,
  `fetchTimeoutMs` int NOT NULL DEFAULT 8000,
  `fetchMaxBytes` int NOT NULL DEFAULT 1000000,
  `respectRobotsTxt` tinyint(1) NOT NULL DEFAULT 1,
  `aiExtractionEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedByUserId` int NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `prospect_crawler_settings_updated_by_fk`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `prospect_crawler_settings` (`id`) VALUES (1);
