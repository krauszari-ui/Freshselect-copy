-- ════════════════════════════════════════════════════════════════════════════
-- Vendor proof-of-delivery portal (additive, idempotent)
--  - organizations.kind: mark an org as a delivery vendor
--  - submissions.assignedVendorOrgId: optional per-client vendor scoping
--  - vendorPods: one PoD record per client per vendor per ISO week
-- Source of truth: drizzle/schema.ts. Rollback: 0043_vendor_pod.down.sql
-- ════════════════════════════════════════════════════════════════════════════

-- organizations.kind (idempotent add)
SET @add_kind := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `organizations` ADD COLUMN `kind` ENUM(''referral_agency'',''delivery_vendor'',''other'') NOT NULL DEFAULT ''referral_agency''',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'organizations' AND column_name = 'kind');
PREPARE s1 FROM @add_kind; EXECUTE s1; DEALLOCATE PREPARE s1;

-- submissions.assignedVendorOrgId (idempotent add)
SET @add_avo := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `submissions` ADD COLUMN `assignedVendorOrgId` INT NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'assignedVendorOrgId');
PREPARE s2 FROM @add_avo; EXECUTE s2; DEALLOCATE PREPARE s2;

CREATE TABLE IF NOT EXISTS `vendorPods` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL,
  `vendorOrgId` INT NOT NULL,
  `weekOf` TIMESTAMP NOT NULL,
  `podUrl` VARCHAR(1024) NULL,
  `documentId` INT NULL,
  `podMethod` ENUM('signature','photo','gps','recipient_confirmation','staff_attestation') NULL,
  `note` TEXT NULL,
  `status` ENUM('submitted','verified','rejected') NOT NULL DEFAULT 'submitted',
  `uploadedBy` INT NULL,
  `verifiedBy` INT NULL,
  `verifiedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_vendorPods_client_vendor_week` (`submissionId`, `vendorOrgId`, `weekOf`),
  INDEX `idx_vendorPods_submissionId` (`submissionId`),
  INDEX `idx_vendorPods_vendorOrgId_weekOf` (`vendorOrgId`, `weekOf`),
  CONSTRAINT `fk_vendorPods_submissionId` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_vendorPods_vendorOrgId` FOREIGN KEY (`vendorOrgId`) REFERENCES `organizations`(`id`),
  CONSTRAINT `fk_vendorPods_documentId` FOREIGN KEY (`documentId`) REFERENCES `complianceDocuments`(`id`),
  CONSTRAINT `fk_vendorPods_uploadedBy` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_vendorPods_verifiedBy` FOREIGN KEY (`verifiedBy`) REFERENCES `users`(`id`)
);
