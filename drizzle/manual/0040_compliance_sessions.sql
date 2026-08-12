-- ════════════════════════════════════════════════════════════════════════════
-- Compliance module — Session management (additive, idempotent)
-- Server-side session records for revocation, device list, idle/absolute
-- timeout, reauth stamping, and forced logout on role/password/MFA change.
-- Source of truth: drizzle/schema.ts. Rollback: 0040_compliance_sessions.down.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `userSessions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `sessionId` VARCHAR(64) NOT NULL,
  `userId` INT NOT NULL,
  `openId` VARCHAR(128) NULL,
  `role` VARCHAR(64) NULL,
  `ip` VARCHAR(64) NULL,
  `userAgent` VARCHAR(512) NULL,
  `mfaVerified` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` TIMESTAMP NOT NULL,
  `reauthAt` TIMESTAMP NULL,
  `revokedAt` TIMESTAMP NULL,
  `revokedBy` INT NULL,
  `revokeReason` VARCHAR(128) NULL,
  UNIQUE KEY `uniq_userSessions_sessionId` (`sessionId`),
  INDEX `idx_userSessions_userId` (`userId`),
  INDEX `idx_userSessions_expiresAt` (`expiresAt`),
  CONSTRAINT `fk_userSessions_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_userSessions_revokedBy` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`)
);
