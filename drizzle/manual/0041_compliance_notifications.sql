-- ════════════════════════════════════════════════════════════════════════════
-- Compliance module — Notifications / escalation (additive, idempotent)
-- In-app notifications for compliance events (break-glass, findings, escalation).
-- Break-glass itself reuses the existing tempAccessGrants table (isBreakGlass).
-- Source of truth: drizzle/schema.ts. Rollback: 0041_compliance_notifications.down.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `complianceNotifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `category` VARCHAR(64) NOT NULL,
  `severity` VARCHAR(16) NOT NULL DEFAULT 'info',
  `title` VARCHAR(256) NOT NULL,
  `body` TEXT NULL,
  `relatedRecordType` VARCHAR(64) NULL,
  `relatedRecordId` VARCHAR(64) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `readAt` TIMESTAMP NULL,
  INDEX `idx_complianceNotifications_userId` (`userId`),
  INDEX `idx_complianceNotifications_readAt` (`readAt`),
  CONSTRAINT `fk_complianceNotifications_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
);
