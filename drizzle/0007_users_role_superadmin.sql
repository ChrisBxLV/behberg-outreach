ALTER TABLE `users` MODIFY COLUMN `role` ENUM('user', 'admin', 'superadmin') NOT NULL DEFAULT 'user';

-- Default seeded operator (DEFAULT_ADMIN_LOGIN, default `behberg`) becomes platform superadmin.
UPDATE `users` SET `role` = 'superadmin' WHERE `openId` = 'login:behberg';
