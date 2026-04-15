-- Ensure default platform operator (`behberg` / `login:behberg`) has superadmin (idempotent).
UPDATE `users` SET `role` = 'superadmin'
WHERE LOWER(TRIM(`openId`)) = 'login:behberg'
   OR LOWER(TRIM(`email`)) = 'behberg';
