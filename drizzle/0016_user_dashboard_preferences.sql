-- Per-user dashboard preferences (cross-device)
CREATE TABLE `user_dashboard_preferences` (
  `userId` int NOT NULL,
  `sectionsJson` json NULL,
  `sectionOrderJson` json NULL,
  `rangeDays` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  CONSTRAINT `user_dashboard_preferences_user_id_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

