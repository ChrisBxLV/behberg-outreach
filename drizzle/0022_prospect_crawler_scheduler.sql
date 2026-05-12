-- Scheduler / operator control columns for Prospect DB crawler (singleton row id=1).

ALTER TABLE `prospect_crawler_settings`
  ADD COLUMN `schedulerEnabled` tinyint(1) NOT NULL DEFAULT 0 AFTER `crawlerEnabled`,
  ADD COLUMN `queuePaused` tinyint(1) NOT NULL DEFAULT 0 AFTER `schedulerEnabled`,
  ADD COLUMN `seedTickIntervalMinutes` int NOT NULL DEFAULT 60 AFTER `queuePaused`,
  ADD COLUMN `companyQueueTickIntervalMinutes` int NOT NULL DEFAULT 10 AFTER `seedTickIntervalMinutes`,
  ADD COLUMN `employeeQueueTickIntervalMinutes` int NOT NULL DEFAULT 30 AFTER `companyQueueTickIntervalMinutes`,
  ADD COLUMN `lastSeedTickAt` timestamp NULL AFTER `employeeQueueTickIntervalMinutes`,
  ADD COLUMN `lastCompanyQueueTickAt` timestamp NULL AFTER `lastSeedTickAt`,
  ADD COLUMN `lastEmployeeQueueTickAt` timestamp NULL AFTER `lastCompanyQueueTickAt`,
  ADD COLUMN `nextSeedTickAt` timestamp NULL AFTER `lastEmployeeQueueTickAt`,
  ADD COLUMN `nextCompanyQueueTickAt` timestamp NULL AFTER `nextSeedTickAt`,
  ADD COLUMN `nextEmployeeQueueTickAt` timestamp NULL AFTER `nextCompanyQueueTickAt`,
  ADD COLUMN `lastManualRunAt` timestamp NULL AFTER `nextEmployeeQueueTickAt`,
  ADD COLUMN `lastManualRunByUserId` int NULL AFTER `lastManualRunAt`,
  ADD COLUMN `lastStopAt` timestamp NULL AFTER `lastManualRunByUserId`,
  ADD COLUMN `lastStopByUserId` int NULL AFTER `lastStopAt`;

ALTER TABLE `prospect_crawler_settings`
  ADD CONSTRAINT `prospect_crawler_settings_manual_user_fk`
    FOREIGN KEY (`lastManualRunByUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `prospect_crawler_settings`
  ADD CONSTRAINT `prospect_crawler_settings_stop_user_fk`
    FOREIGN KEY (`lastStopByUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
