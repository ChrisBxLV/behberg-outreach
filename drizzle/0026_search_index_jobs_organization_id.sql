-- Tenant scope for search index outbox: workers dequeue by organization and entity.

ALTER TABLE `search_index_jobs` ADD COLUMN `organizationId` int NULL AFTER `id`;

UPDATE `search_index_jobs` j
INNER JOIN `people` p ON j.`entityType` = 'person' AND j.`entityId` = p.`id`
SET j.`organizationId` = p.`organizationId`;

UPDATE `search_index_jobs` j
INNER JOIN `companies` c ON j.`entityType` = 'company' AND j.`entityId` = c.`id`
SET j.`organizationId` = c.`organizationId`;

DELETE FROM `search_index_jobs` WHERE `organizationId` IS NULL;

ALTER TABLE `search_index_jobs`
  MODIFY COLUMN `organizationId` int NOT NULL;

ALTER TABLE `search_index_jobs`
  ADD KEY `search_index_jobs_organization_id_idx` (`organizationId`),
  ADD CONSTRAINT `search_index_jobs_organization_id_organizations_id_fk`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
