-- Deduplicate campaign_contacts: keep the row with max(id) per (campaignId, contactId)
UPDATE `email_logs` e
INNER JOIN `campaign_contacts` cc ON e.campaignContactId = cc.id
INNER JOIN (
  SELECT `campaignId`, `contactId`, MAX(`id`) AS `keepId`
  FROM `campaign_contacts`
  GROUP BY `campaignId`, `contactId`
) k ON k.campaignId = cc.campaignId AND k.contactId = cc.contactId
SET e.campaignContactId = k.keepId
WHERE e.campaignContactId IS NOT NULL AND cc.id < k.keepId;
--> statement-breakpoint
DELETE cc FROM `campaign_contacts` cc
INNER JOIN (
  SELECT `campaignId`, `contactId`, MAX(`id`) AS `keepId`
  FROM `campaign_contacts`
  GROUP BY `campaignId`, `contactId`
) k ON cc.campaignId = k.campaignId AND cc.contactId = k.contactId AND cc.id < k.keepId;
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_contacts_campaign_contact_unique` ON `campaign_contacts` (`campaignId`, `contactId`);
