-- ════════════════════════════════════════════════════════════════════════════
-- Compliance & Audit module — additive foundation migration
-- ────────────────────────────────────────────────────────────────────────────
-- EXPAND-ONLY. Creates new tables only; no existing table is altered, renamed,
-- or dropped. Safe to run against production during the expand phase of an
-- expand-and-contract rollout. Every statement is idempotent (IF NOT EXISTS).
--
-- SOURCE OF TRUTH: `drizzle/schema.ts`. In an environment with DATABASE_URL set,
-- prefer regenerating the official migration + snapshot with:
--     pnpm drizzle-kit generate
-- This hand-authored file exists so a DBA can apply the same schema by hand in
-- environments where drizzle-kit cannot run. Column types mirror the Drizzle
-- definitions; adjust collation/engine defaults to match your instance.
--
-- Rollback: drizzle/manual/0037_compliance_foundation.down.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Durable append-only audit events (hash chain) ──────────────────────────
CREATE TABLE IF NOT EXISTS `auditEvents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `actorId` INT NULL,
  `actorName` VARCHAR(256) NULL,
  `originalActorId` INT NULL,
  `actorRole` VARCHAR(64) NULL,
  `orgId` INT NULL,
  `action` VARCHAR(96) NOT NULL,
  `recordType` VARCHAR(64) NOT NULL,
  `recordId` VARCHAR(64) NULL,
  `clientId` INT NULL,
  `prevValue` JSON NULL,
  `newValue` JSON NULL,
  `reason` TEXT NULL,
  `approvalId` INT NULL,
  `requestId` VARCHAR(64) NULL,
  `sessionId` VARCHAR(64) NULL,
  `correlationId` VARCHAR(64) NULL,
  `ip` VARCHAR(64) NULL,
  `userAgent` VARCHAR(512) NULL,
  `success` BOOLEAN NOT NULL DEFAULT TRUE,
  `prevHash` VARCHAR(64) NULL,
  `hash` VARCHAR(64) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_auditEvents_recordType_recordId` (`recordType`, `recordId`),
  INDEX `idx_auditEvents_clientId` (`clientId`),
  INDEX `idx_auditEvents_actorId` (`actorId`),
  INDEX `idx_auditEvents_createdAt` (`createdAt`),
  INDEX `idx_auditEvents_action` (`action`)
);

-- ─── Normalized RBAC ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `complianceRoles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(64) NOT NULL UNIQUE,
  `name` VARCHAR(128) NOT NULL,
  `description` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `compliancePermissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(96) NOT NULL UNIQUE,
  `description` TEXT NULL
);

CREATE TABLE IF NOT EXISTS `rolePermissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `roleId` INT NOT NULL,
  `permissionId` INT NOT NULL,
  UNIQUE KEY `uniq_rolePermissions` (`roleId`, `permissionId`),
  CONSTRAINT `fk_rolePermissions_role` FOREIGN KEY (`roleId`) REFERENCES `complianceRoles`(`id`),
  CONSTRAINT `fk_rolePermissions_perm` FOREIGN KEY (`permissionId`) REFERENCES `compliancePermissions`(`id`)
);

CREATE TABLE IF NOT EXISTS `userComplianceRoles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `roleId` INT NOT NULL,
  `grantedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_userComplianceRoles` (`userId`, `roleId`),
  CONSTRAINT `fk_userComplianceRoles_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_userComplianceRoles_role` FOREIGN KEY (`roleId`) REFERENCES `complianceRoles`(`id`)
);

CREATE TABLE IF NOT EXISTS `recordScopes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `scopeType` ENUM('client','organization','region','all') NOT NULL,
  `scopeValue` VARCHAR(128) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_recordScopes_userId` (`userId`),
  CONSTRAINT `fk_recordScopes_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `tempAccessGrants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `reason` TEXT NOT NULL,
  `scope` VARCHAR(256) NOT NULL,
  `approvedBy` INT NULL,
  `grantedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` TIMESTAMP NOT NULL,
  `revokedAt` TIMESTAMP NULL,
  `isBreakGlass` BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX `idx_tempAccessGrants_userId` (`userId`),
  INDEX `idx_tempAccessGrants_expiresAt` (`expiresAt`),
  CONSTRAINT `fk_tempAccessGrants_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_tempAccessGrants_approver` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`)
);

-- ─── MFA ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `mfaEnrollments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL UNIQUE,
  `totpSecret` VARCHAR(256) NULL,
  `method` ENUM('totp','webauthn') NOT NULL DEFAULT 'totp',
  `enrolledAt` TIMESTAMP NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT FALSE,
  `resetRequestedAt` TIMESTAMP NULL,
  `resetApprovedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_mfaEnrollments_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_mfaEnrollments_reset` FOREIGN KEY (`resetApprovedBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `mfaRecoveryCodes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `codeHash` VARCHAR(64) NOT NULL,
  `usedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_mfaRecoveryCodes_userId` (`userId`),
  CONSTRAINT `fk_mfaRecoveryCodes_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
);

-- ─── Durable background jobs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `jobs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobType` VARCHAR(64) NOT NULL,
  `idempotencyKey` VARCHAR(128) NULL,
  `payload` JSON NULL,
  `status` ENUM('queued','running','succeeded','failed','dead_letter') NOT NULL DEFAULT 'queued',
  `attempts` INT NOT NULL DEFAULT 0,
  `maxAttempts` INT NOT NULL DEFAULT 5,
  `runAfter` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastError` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completedAt` TIMESTAMP NULL,
  UNIQUE KEY `uniq_jobs_idempotencyKey` (`idempotencyKey`),
  INDEX `idx_jobs_status_runAfter` (`status`, `runAfter`)
);

-- ─── One-time upload tokens ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `uploadTokens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tokenHash` VARCHAR(64) NOT NULL UNIQUE,
  `submissionId` INT NULL,
  `draftKey` VARCHAR(128) NULL,
  `issuedBy` INT NULL,
  `maxBytes` INT NOT NULL DEFAULT 26214400,
  `usedAt` TIMESTAMP NULL,
  `expiresAt` TIMESTAMP NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_uploadTokens_submissionId` (`submissionId`),
  CONSTRAINT `fk_uploadTokens_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_uploadTokens_issuer` FOREIGN KEY (`issuedBy`) REFERENCES `users`(`id`)
);

-- ─── Compliance documents (object-key based) ────────────────────────────────
CREATE TABLE IF NOT EXISTS `complianceDocuments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NULL,
  `objectKey` VARCHAR(512) NOT NULL,
  `originalFilename` VARCHAR(256) NOT NULL,
  `mimeType` VARCHAR(128) NULL,
  `fileSize` INT NULL,
  `checksum` VARCHAR(64) NULL,
  `scanStatus` ENUM('pending','quarantined','passed','failed') NOT NULL DEFAULT 'quarantined',
  `confidentiality` ENUM('standard','sensitive','highly_sensitive','attorney_client_privileged') NOT NULL DEFAULT 'standard',
  `version` INT NOT NULL DEFAULT 1,
  `supersedesId` INT NULL,
  `category` VARCHAR(64) NULL,
  `approvalStatus` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `effectiveDate` TIMESTAMP NULL,
  `expirationDate` TIMESTAMP NULL,
  `retentionDate` TIMESTAMP NULL,
  `legalHold` BOOLEAN NOT NULL DEFAULT FALSE,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active',
  `uploadedBy` INT NULL,
  `deletedAt` TIMESTAMP NULL,
  `deletedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_complianceDocuments_submissionId` (`submissionId`),
  INDEX `idx_complianceDocuments_scanStatus` (`scanStatus`),
  CONSTRAINT `fk_complianceDocuments_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_complianceDocuments_uploadedBy` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_complianceDocuments_deletedBy` FOREIGN KEY (`deletedBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `documentAccessLog` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `documentId` INT NOT NULL,
  `userId` INT NULL,
  `action` ENUM('view','download','url_mint') NOT NULL,
  `ip` VARCHAR(64) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_documentAccessLog_documentId` (`documentId`),
  CONSTRAINT `fk_documentAccessLog_doc` FOREIGN KEY (`documentId`) REFERENCES `complianceDocuments`(`id`),
  CONSTRAINT `fk_documentAccessLog_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
);

-- ─── Eligibility verifications (append-only) ────────────────────────────────
CREATE TABLE IF NOT EXISTS `eligibilityVerifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL,
  `verificationType` VARCHAR(64) NOT NULL DEFAULT 'medicaid',
  `medicaidStatus` ENUM('active','inactive','pending','unknown') NOT NULL DEFAULT 'unknown',
  `managedCareStatus` VARCHAR(64) NULL,
  `mco` VARCHAR(128) NULL,
  `cinNormalized` VARCHAR(64) NULL,
  `verificationSource` VARCHAR(128) NULL,
  `verificationReference` VARCHAR(128) NULL,
  `verifiedDate` TIMESTAMP NULL,
  `effectiveStartDate` TIMESTAMP NULL,
  `effectiveEndDate` TIMESTAMP NULL,
  `dateOfServiceApplicability` TEXT NULL,
  `evidenceDocumentId` INT NULL,
  `verifiedBy` INT NULL,
  `verificationMethod` VARCHAR(64) NULL,
  `notes` TEXT NULL,
  `status` ENUM('verified','pending','expired','not_eligible','superseded') NOT NULL DEFAULT 'pending',
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active',
  `version` INT NOT NULL DEFAULT 1,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_eligibilityVerifications_submissionId` (`submissionId`),
  INDEX `idx_eligibilityVerifications_status` (`status`),
  CONSTRAINT `fk_eligibilityVerifications_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_eligibilityVerifications_doc` FOREIGN KEY (`evidenceDocumentId`) REFERENCES `complianceDocuments`(`id`),
  CONSTRAINT `fk_eligibilityVerifications_verifiedBy` FOREIGN KEY (`verifiedBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_eligibilityVerifications_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
);

-- ─── Enrollment episodes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `enrollmentEpisodes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL,
  `program` VARCHAR(128) NULL,
  `scn` VARCHAR(128) NULL,
  `mco` VARCHAR(128) NULL,
  `serviceRegion` VARCHAR(128) NULL,
  `enrollmentStart` TIMESTAMP NULL,
  `enrollmentEnd` TIMESTAMP NULL,
  `enrollmentStatus` ENUM('active','terminated','pending','suspended') NOT NULL DEFAULT 'pending',
  `terminationReason` TEXT NULL,
  `referralId` INT NULL,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active',
  `version` INT NOT NULL DEFAULT 1,
  `createdBy` INT NULL,
  `approvedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_enrollmentEpisodes_submissionId` (`submissionId`),
  CONSTRAINT `fk_enrollmentEpisodes_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_enrollmentEpisodes_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_enrollmentEpisodes_approvedBy` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`)
);

-- ─── SCN referrals ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `scnReferrals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL,
  `enrollmentEpisodeId` INT NULL,
  `referralIdentifier` VARCHAR(128) NULL,
  `referringEntity` VARCHAR(256) NULL,
  `referralSource` VARCHAR(128) NULL,
  `referralDate` TIMESTAMP NULL,
  `receivedDate` TIMESTAMP NULL,
  `requestedService` VARCHAR(256) NULL,
  `screeningResult` VARCHAR(256) NULL,
  `nutritionNeed` TEXT NULL,
  `enhancedPopulationCategory` VARCHAR(128) NULL,
  `navigator` VARCHAR(256) NULL,
  `scn` VARCHAR(128) NULL,
  `referralStatus` ENUM('received','in_review','accepted','rejected','expired','withdrawn') NOT NULL DEFAULT 'received',
  `acceptanceDate` TIMESTAMP NULL,
  `rejectionReason` TEXT NULL,
  `referralEvidenceId` INT NULL,
  `effectiveStartDate` TIMESTAMP NULL,
  `effectiveEndDate` TIMESTAMP NULL,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active',
  `version` INT NOT NULL DEFAULT 1,
  `createdBy` INT NULL,
  `reviewedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_scnReferrals_submissionId` (`submissionId`),
  INDEX `idx_scnReferrals_referralStatus` (`referralStatus`),
  CONSTRAINT `fk_scnReferrals_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_scnReferrals_episode` FOREIGN KEY (`enrollmentEpisodeId`) REFERENCES `enrollmentEpisodes`(`id`),
  CONSTRAINT `fk_scnReferrals_doc` FOREIGN KEY (`referralEvidenceId`) REFERENCES `complianceDocuments`(`id`),
  CONSTRAINT `fk_scnReferrals_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_scnReferrals_reviewedBy` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`)
);

-- ─── Service authorizations (DECIMAL money) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS `serviceAuthorizations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL,
  `referralId` INT NULL,
  `enrollmentEpisodeId` INT NULL,
  `authorizationNumber` VARCHAR(128) NULL,
  `scn` VARCHAR(128) NULL,
  `mco` VARCHAR(128) NULL,
  `serviceCategory` VARCHAR(128) NULL,
  `serviceCode` VARCHAR(64) NULL,
  `modifier` VARCHAR(32) NULL,
  `authorizedUnits` INT NOT NULL DEFAULT 0,
  `unitType` ENUM('meal','box','delivery','day','week','unit') NOT NULL DEFAULT 'unit',
  `frequency` VARCHAR(64) NULL,
  `rate` DECIMAL(12,2) NULL,
  `rateSource` VARCHAR(128) NULL,
  `startDate` TIMESTAMP NULL,
  `endDate` TIMESTAMP NULL,
  `restrictions` TEXT NULL,
  `remainingUnits` INT NOT NULL DEFAULT 0,
  `status` ENUM('draft','active','exhausted','expired','suspended','voided') NOT NULL DEFAULT 'draft',
  `sourceDocumentId` INT NULL,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active',
  `version` INT NOT NULL DEFAULT 1,
  `createdBy` INT NULL,
  `reviewedBy` INT NULL,
  `approvedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_serviceAuthorizations_submissionId` (`submissionId`),
  INDEX `idx_serviceAuthorizations_status` (`status`),
  UNIQUE KEY `uniq_serviceAuthorizations_authorizationNumber` (`authorizationNumber`),
  CONSTRAINT `fk_serviceAuthorizations_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_serviceAuthorizations_referral` FOREIGN KEY (`referralId`) REFERENCES `scnReferrals`(`id`),
  CONSTRAINT `fk_serviceAuthorizations_episode` FOREIGN KEY (`enrollmentEpisodeId`) REFERENCES `enrollmentEpisodes`(`id`),
  CONSTRAINT `fk_serviceAuthorizations_doc` FOREIGN KEY (`sourceDocumentId`) REFERENCES `complianceDocuments`(`id`),
  CONSTRAINT `fk_serviceAuthorizations_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_serviceAuthorizations_reviewedBy` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_serviceAuthorizations_approvedBy` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`)
);

-- ─── Requirements engine ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `requirementDefinitions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(96) NOT NULL UNIQUE,
  `category` VARCHAR(96) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_requirementDefinitions_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `requirementVersions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `definitionId` INT NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `title` VARCHAR(256) NOT NULL,
  `plainDescription` TEXT NULL,
  `sourceOrganization` VARCHAR(128) NULL,
  `sourceDocument` VARCHAR(256) NULL,
  `sourceUrl` VARCHAR(512) NULL,
  `section` VARCHAR(128) NULL,
  `page` VARCHAR(32) NULL,
  `effectiveDate` TIMESTAMP NULL,
  `endDate` TIMESTAMP NULL,
  `serviceCategory` VARCHAR(128) NULL,
  `population` VARCHAR(128) NULL,
  `program` VARCHAR(128) NULL,
  `scn` VARCHAR(128) NULL,
  `mco` VARCHAR(128) NULL,
  `evidenceRequired` TEXT NULL,
  `responsibleRole` VARCHAR(64) NULL,
  `reviewerRole` VARCHAR(64) NULL,
  `blocking` BOOLEAN NOT NULL DEFAULT TRUE,
  `renewalFrequency` VARCHAR(64) NULL,
  `dueDateRule` VARCHAR(128) NULL,
  `riskLevel` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `auditTest` TEXT NULL,
  `failureConsequence` TEXT NULL,
  `internalInterpretation` TEXT NULL,
  `attorneyReviewStatus` VARCHAR(64) NULL,
  `approvalStatus` ENUM('draft','internal_review','attorney_review','approved','retired') NOT NULL DEFAULT 'draft',
  `supersededById` INT NULL,
  `retroactiveApproved` BOOLEAN NOT NULL DEFAULT FALSE,
  `retroactiveLegalBasis` TEXT NULL,
  `retroactiveApprovedBy` INT NULL,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_requirementVersions` (`definitionId`, `version`),
  INDEX `idx_requirementVersions_effectiveDate` (`effectiveDate`),
  CONSTRAINT `fk_requirementVersions_def` FOREIGN KEY (`definitionId`) REFERENCES `requirementDefinitions`(`id`),
  CONSTRAINT `fk_requirementVersions_retroBy` FOREIGN KEY (`retroactiveApprovedBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_requirementVersions_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `requirementApplicabilityRules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `requirementVersionId` INT NOT NULL,
  `attribute` VARCHAR(64) NOT NULL,
  `operator` ENUM('eq','neq','in','exists') NOT NULL DEFAULT 'eq',
  `value` VARCHAR(256) NULL,
  CONSTRAINT `fk_requirementApplicabilityRules_ver` FOREIGN KEY (`requirementVersionId`) REFERENCES `requirementVersions`(`id`)
);

CREATE TABLE IF NOT EXISTS `requirementAssignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL,
  `requirementVersionId` INT NOT NULL,
  `serviceDate` TIMESTAMP NULL,
  `status` ENUM('pending','in_progress','satisfied','failed','waived','not_applicable') NOT NULL DEFAULT 'pending',
  `dueDate` TIMESTAMP NULL,
  `blocking` BOOLEAN NOT NULL DEFAULT TRUE,
  `satisfiedAt` TIMESTAMP NULL,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active',
  `version` INT NOT NULL DEFAULT 1,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_requirementAssignments` (`submissionId`, `requirementVersionId`, `serviceDate`),
  INDEX `idx_requirementAssignments_submissionId` (`submissionId`),
  CONSTRAINT `fk_requirementAssignments_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_requirementAssignments_ver` FOREIGN KEY (`requirementVersionId`) REFERENCES `requirementVersions`(`id`),
  CONSTRAINT `fk_requirementAssignments_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `requirementEvidence` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `assignmentId` INT NOT NULL,
  `documentId` INT NULL,
  `note` TEXT NULL,
  `addedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_requirementEvidence_assignmentId` (`assignmentId`),
  CONSTRAINT `fk_requirementEvidence_assignment` FOREIGN KEY (`assignmentId`) REFERENCES `requirementAssignments`(`id`),
  CONSTRAINT `fk_requirementEvidence_doc` FOREIGN KEY (`documentId`) REFERENCES `complianceDocuments`(`id`),
  CONSTRAINT `fk_requirementEvidence_addedBy` FOREIGN KEY (`addedBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `requirementReviews` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `assignmentId` INT NOT NULL,
  `reviewerId` INT NULL,
  `outcome` ENUM('approved','rejected','needs_info') NOT NULL,
  `note` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_requirementReviews_assignment` FOREIGN KEY (`assignmentId`) REFERENCES `requirementAssignments`(`id`),
  CONSTRAINT `fk_requirementReviews_reviewer` FOREIGN KEY (`reviewerId`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `requirementExceptions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL,
  `assignmentId` INT NULL,
  `exceptionType` VARCHAR(64) NOT NULL,
  `justification` TEXT NOT NULL,
  `supportingDocumentId` INT NULL,
  `requestedBy` INT NOT NULL,
  `approvedBy` INT NULL,
  `complianceApprovedBy` INT NULL,
  `status` ENUM('requested','approved','rejected','expired') NOT NULL DEFAULT 'requested',
  `effectiveDate` TIMESTAMP NULL,
  `expirationDate` TIMESTAMP NULL,
  `followUpTaskId` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_requirementExceptions_submissionId` (`submissionId`),
  CONSTRAINT `fk_requirementExceptions_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_requirementExceptions_assignment` FOREIGN KEY (`assignmentId`) REFERENCES `requirementAssignments`(`id`),
  CONSTRAINT `fk_requirementExceptions_doc` FOREIGN KEY (`supportingDocumentId`) REFERENCES `complianceDocuments`(`id`),
  CONSTRAINT `fk_requirementExceptions_requestedBy` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_requirementExceptions_approvedBy` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_requirementExceptions_complianceBy` FOREIGN KEY (`complianceApprovedBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `requirementApprovals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `requirementVersionId` INT NOT NULL,
  `approverId` INT NULL,
  `approvalType` VARCHAR(64) NOT NULL,
  `note` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_requirementApprovals_ver` FOREIGN KEY (`requirementVersionId`) REFERENCES `requirementVersions`(`id`),
  CONSTRAINT `fk_requirementApprovals_approver` FOREIGN KEY (`approverId`) REFERENCES `users`(`id`)
);

-- ─── Cached readiness snapshot ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `complianceReadiness` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL UNIQUE,
  `status` ENUM('intake_pending','eligibility_pending','referral_pending','authorization_pending','clinical_review_pending','evidence_missing','compliance_review_pending','ready_for_service','service_hold','billing_hold','under_audit','inactive') NOT NULL DEFAULT 'intake_pending',
  `blockingReasons` JSON NULL,
  `computedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_complianceReadiness_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`)
);
