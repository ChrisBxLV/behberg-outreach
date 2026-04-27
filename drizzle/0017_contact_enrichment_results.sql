-- Contact-level enrichment results (safe/free sources only)
CREATE TABLE `enrichment_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `organizationId` int NOT NULL,
  `contactId` int NOT NULL,
  `source` varchar(64) NOT NULL,
  `fieldName` varchar(128) NOT NULL,
  `fieldValue` text NOT NULL,
  `confidence` int NOT NULL DEFAULT 0,
  `personalData` boolean NOT NULL DEFAULT false,
  `rawData` json NULL,
  `collectedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `enrichment_results_organization_id_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `enrichment_results_contact_id_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add enrichment columns to contacts (do not break existing rows)
ALTER TABLE `contacts`
  ADD COLUMN `normalizedDomain` varchar(255) NULL,
  ADD COLUMN `enrichmentStatus` varchar(32) NOT NULL DEFAULT 'not_enriched',
  ADD COLUMN `enrichmentUpdatedAt` timestamp NULL;

