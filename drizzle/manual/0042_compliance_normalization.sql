-- ════════════════════════════════════════════════════════════════════════════
-- Compliance module — Normalized projection of submissions.formData (additive)
-- Canonical identity fields per submission + mismatch flags for reconciliation.
-- The submissions table is the source of truth and is NOT modified.
-- Source of truth: drizzle/schema.ts. Rollback: 0042_compliance_normalization.down.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `submissionNormalized` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL,
  `medicaidIdNormalized` VARCHAR(64) NULL,
  `firstName` VARCHAR(128) NULL,
  `lastName` VARCHAR(128) NULL,
  `email` VARCHAR(320) NULL,
  `phoneNormalized` VARCHAR(32) NULL,
  `zipcode` VARCHAR(10) NULL,
  `mismatchFlags` JSON NULL,
  `sourceHash` VARCHAR(64) NULL,
  `reconciledAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_submissionNormalized_submissionId` (`submissionId`),
  INDEX `idx_submissionNormalized_medicaidIdNormalized` (`medicaidIdNormalized`),
  CONSTRAINT `fk_submissionNormalized_submissionId` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`)
);
