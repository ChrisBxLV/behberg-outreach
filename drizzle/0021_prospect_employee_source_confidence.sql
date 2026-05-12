-- Optional confidence score for website-sourced prospect employees (business_contacts mode).
ALTER TABLE `prospect_employees`
  ADD COLUMN `sourceConfidence` double NULL AFTER `sourceEvidenceUrl`;
