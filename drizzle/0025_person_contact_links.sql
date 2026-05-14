-- Bridge prospect v2 `people` to legacy `contacts` for campaign flows (temporary compatibility layer).
-- Campaigns continue to use `contacts.id`; a future migration can point enrollment at `crm_contacts` / `personId`.

CREATE TABLE `person_contact_links` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `organizationId` int NOT NULL,
  `personId` bigint unsigned NOT NULL,
  `contactId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `person_contact_links_organization_id_person_id_unique` (`organizationId`, `personId`),
  UNIQUE KEY `person_contact_links_organization_id_contact_id_unique` (`organizationId`, `contactId`),
  KEY `person_contact_links_person_id_idx` (`personId`),
  KEY `person_contact_links_contact_id_idx` (`contactId`),
  CONSTRAINT `person_contact_links_organization_id_organizations_id_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `person_contact_links_person_id_people_id_fk`
    FOREIGN KEY (`personId`) REFERENCES `people` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `person_contact_links_contact_id_contacts_id_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
