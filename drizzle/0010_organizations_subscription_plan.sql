ALTER TABLE `organizations`
  ADD COLUMN `subscriptionPlanId` varchar(64) NOT NULL DEFAULT 'free' AFTER `name`;
