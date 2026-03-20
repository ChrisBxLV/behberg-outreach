ALTER TABLE `users`
  ADD COLUMN `passwordSalt` varchar(128),
  ADD COLUMN `passwordHash` varchar(128);
