-- ════════════════════════════════════════════════════════════════════════════
-- Compliance module — Phase 3 additive migration
-- nutrition · service delivery · billing · self-audit/CAPA · overpayments
-- ────────────────────────────────────────────────────────────────────────────
-- EXPAND-ONLY, idempotent. Source of truth: drizzle/schema.ts. With DATABASE_URL
-- set, prefer `pnpm drizzle-kit generate`. Rollback: 0038_compliance_phase3.down.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Nutrition ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `nutritionAssessments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `submissionId` INT NOT NULL,
  `assessmentDate` TIMESTAMP NULL, `clinicalCriteria` TEXT NULL, `nutritionDiagnosis` TEXT NULL,
  `allergies` TEXT NULL, `dietaryRestrictions` TEXT NULL, `culturalPreferences` TEXT NULL, `medicalRestrictions` TEXT NULL,
  `reassessmentDate` TIMESTAMP NULL, `effectiveStartDate` TIMESTAMP NULL, `effectiveEndDate` TIMESTAMP NULL,
  `superseded` BOOLEAN NOT NULL DEFAULT FALSE,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active',
  `version` INT NOT NULL DEFAULT 1, `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_nutritionAssessments_submissionId` (`submissionId`),
  CONSTRAINT `fk_nutritionAssessments_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_nutritionAssessments_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `nutritionPlans` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `submissionId` INT NOT NULL, `assessmentId` INT NULL,
  `serviceCategory` VARCHAR(128) NULL, `frequency` VARCHAR(64) NULL, `duration` VARCHAR(64) NULL,
  `status` ENUM('draft','active','superseded') NOT NULL DEFAULT 'draft', `currentVersion` INT NOT NULL DEFAULT 1, `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_nutritionPlans_submissionId` (`submissionId`),
  CONSTRAINT `fk_nutritionPlans_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_nutritionPlans_assessment` FOREIGN KEY (`assessmentId`) REFERENCES `nutritionAssessments`(`id`)
);

CREATE TABLE IF NOT EXISTS `nutritionPlanVersions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `planId` INT NOT NULL, `version` INT NOT NULL,
  `mealPlan` TEXT NULL, `dietCategory` VARCHAR(128) NULL, `evidenceDocumentId` INT NULL, `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_nutritionPlanVersions` (`planId`,`version`),
  CONSTRAINT `fk_nutritionPlanVersions_plan` FOREIGN KEY (`planId`) REFERENCES `nutritionPlans`(`id`),
  CONSTRAINT `fk_nutritionPlanVersions_doc` FOREIGN KEY (`evidenceDocumentId`) REFERENCES `complianceDocuments`(`id`)
);

CREATE TABLE IF NOT EXISTS `clinicalApprovals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `submissionId` INT NOT NULL, `planId` INT NULL, `assessmentId` INT NULL,
  `reviewerId` INT NULL, `reviewerName` VARCHAR(256) NULL,
  `credentialType` VARCHAR(32) NULL, `credentialNumber` VARCHAR(64) NULL, `credentialValidFrom` TIMESTAMP NULL, `credentialValidUntil` TIMESTAMP NULL,
  `approvalDate` TIMESTAMP NULL, `serviceDate` TIMESTAMP NULL, `outcome` ENUM('approved','rejected') NOT NULL DEFAULT 'approved', `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_clinicalApprovals_submissionId` (`submissionId`),
  CONSTRAINT `fk_clinicalApprovals_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_clinicalApprovals_plan` FOREIGN KEY (`planId`) REFERENCES `nutritionPlans`(`id`),
  CONSTRAINT `fk_clinicalApprovals_assessment` FOREIGN KEY (`assessmentId`) REFERENCES `nutritionAssessments`(`id`),
  CONSTRAINT `fk_clinicalApprovals_reviewer` FOREIGN KEY (`reviewerId`) REFERENCES `users`(`id`)
);

-- ─── Service delivery ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `servicePlans` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `submissionId` INT NOT NULL, `authorizationId` INT NULL,
  `serviceCategory` VARCHAR(128) NULL, `status` ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active', `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_servicePlans_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_servicePlans_auth` FOREIGN KEY (`authorizationId`) REFERENCES `serviceAuthorizations`(`id`)
);

CREATE TABLE IF NOT EXISTS `serviceEncounters` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `submissionId` INT NOT NULL, `authorizationId` INT NULL, `referralId` INT NULL,
  `serviceCategory` VARCHAR(128) NULL, `dateOfService` TIMESTAMP NULL, `units` INT NOT NULL DEFAULT 0,
  `unitType` ENUM('meal','box','delivery','day','week','unit') NOT NULL DEFAULT 'unit', `itemDescription` TEXT NULL, `dietCategory` VARCHAR(128) NULL,
  `state` ENUM('draft','documented','pending_review','approved','locked','invoiced','paid','corrected_by_amendment','voided') NOT NULL DEFAULT 'draft',
  `documentationCompletedAt` TIMESTAMP NULL, `approvedBy` INT NULL, `invoiceLineId` INT NULL,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active', `version` INT NOT NULL DEFAULT 1, `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_serviceEncounters_submissionId` (`submissionId`), INDEX `idx_serviceEncounters_state` (`state`),
  CONSTRAINT `fk_serviceEncounters_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_serviceEncounters_auth` FOREIGN KEY (`authorizationId`) REFERENCES `serviceAuthorizations`(`id`),
  CONSTRAINT `fk_serviceEncounters_referral` FOREIGN KEY (`referralId`) REFERENCES `scnReferrals`(`id`),
  CONSTRAINT `fk_serviceEncounters_approvedBy` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_serviceEncounters_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `deliveries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `encounterId` INT NOT NULL, `deliveryAddress` TEXT NULL, `deliveredAt` TIMESTAMP NULL, `staffOrVendor` VARCHAR(256) NULL,
  `podMethod` ENUM('signature','photo','gps','recipient_confirmation','staff_attestation') NULL,
  `signatureDocumentId` INT NULL, `photoDocumentId` INT NULL, `gpsEvidence` VARCHAR(128) NULL, `temperatureRecord` VARCHAR(64) NULL, `incident` TEXT NULL,
  `status` ENUM('delivered','failed','redelivered') NOT NULL DEFAULT 'delivered', `createdBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_deliveries_encounterId` (`encounterId`),
  CONSTRAINT `fk_deliveries_encounter` FOREIGN KEY (`encounterId`) REFERENCES `serviceEncounters`(`id`),
  CONSTRAINT `fk_deliveries_sig` FOREIGN KEY (`signatureDocumentId`) REFERENCES `complianceDocuments`(`id`),
  CONSTRAINT `fk_deliveries_photo` FOREIGN KEY (`photoDocumentId`) REFERENCES `complianceDocuments`(`id`)
);

CREATE TABLE IF NOT EXISTS `deliveryAttempts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `encounterId` INT NOT NULL, `attemptedAt` TIMESTAMP NULL, `failedReason` TEXT NULL,
  `redelivery` BOOLEAN NOT NULL DEFAULT FALSE, `createdBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_deliveryAttempts_encounter` FOREIGN KEY (`encounterId`) REFERENCES `serviceEncounters`(`id`)
);

CREATE TABLE IF NOT EXISTS `serviceAmendments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `encounterId` INT NOT NULL, `reason` TEXT NOT NULL,
  `originalValues` JSON NOT NULL, `amendedValues` JSON NOT NULL, `amendedBy` INT NULL, `approvedBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_serviceAmendments_encounterId` (`encounterId`),
  CONSTRAINT `fk_serviceAmendments_encounter` FOREIGN KEY (`encounterId`) REFERENCES `serviceEncounters`(`id`)
);

-- ─── Billing ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `invoiceHeaders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `invoiceNumber` VARCHAR(128) NULL, `submissionId` INT NOT NULL,
  `status` ENUM('draft','validated','approved','submitted','paid','denied','void') NOT NULL DEFAULT 'draft',
  `expectedTotal` DECIMAL(12,2) NULL, `submittedTotal` DECIMAL(12,2) NULL, `paidTotal` DECIMAL(12,2) NULL,
  `submissionDate` TIMESTAMP NULL, `timelinessDeadline` TIMESTAMP NULL, `acceptedDate` TIMESTAMP NULL,
  `reconciliationStatus` ENUM('unreconciled','partial','reconciled') NOT NULL DEFAULT 'unreconciled',
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active', `version` INT NOT NULL DEFAULT 1, `createdBy` INT NULL, `approvedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_invoiceHeaders_submissionId` (`submissionId`), UNIQUE KEY `uniq_invoiceHeaders_invoiceNumber` (`invoiceNumber`),
  CONSTRAINT `fk_invoiceHeaders_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_invoiceHeaders_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_invoiceHeaders_approvedBy` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `invoiceLines` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `invoiceId` INT NOT NULL, `encounterId` INT NULL, `authorizationId` INT NULL,
  `serviceCode` VARCHAR(64) NULL, `serviceDate` TIMESTAMP NULL, `units` INT NOT NULL DEFAULT 0, `rate` DECIMAL(12,2) NULL, `expectedAmount` DECIMAL(12,2) NULL,
  `idempotencyKey` VARCHAR(64) NOT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_invoiceLines_idempotencyKey` (`idempotencyKey`), INDEX `idx_invoiceLines_invoiceId` (`invoiceId`),
  CONSTRAINT `fk_invoiceLines_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoiceHeaders`(`id`),
  CONSTRAINT `fk_invoiceLines_encounter` FOREIGN KEY (`encounterId`) REFERENCES `serviceEncounters`(`id`),
  CONSTRAINT `fk_invoiceLines_auth` FOREIGN KEY (`authorizationId`) REFERENCES `serviceAuthorizations`(`id`)
);

CREATE TABLE IF NOT EXISTS `invoiceSubmissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `invoiceId` INT NOT NULL, `submittedAt` TIMESTAMP NULL, `submittedBy` INT NULL, `clearinghouseRef` VARCHAR(128) NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_invoiceSubmissions_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoiceHeaders`(`id`),
  CONSTRAINT `fk_invoiceSubmissions_by` FOREIGN KEY (`submittedBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `invoiceId` INT NULL, `submissionId` INT NOT NULL, `paidAmount` DECIMAL(12,2) NOT NULL,
  `paymentDate` TIMESTAMP NULL, `payerReference` VARCHAR(128) NULL, `createdBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_payments_invoiceId` (`invoiceId`),
  CONSTRAINT `fk_payments_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoiceHeaders`(`id`),
  CONSTRAINT `fk_payments_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`)
);

CREATE TABLE IF NOT EXISTS `paymentAllocations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `paymentId` INT NOT NULL, `invoiceLineId` INT NOT NULL, `allocatedAmount` DECIMAL(12,2) NOT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_paymentAllocations_payment` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`),
  CONSTRAINT `fk_paymentAllocations_line` FOREIGN KEY (`invoiceLineId`) REFERENCES `invoiceLines`(`id`)
);

CREATE TABLE IF NOT EXISTS `denials` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `invoiceId` INT NULL, `invoiceLineId` INT NULL, `denialCode` VARCHAR(64) NULL, `denialReason` TEXT NULL,
  `appealStatus` ENUM('none','appealed','overturned','upheld') NOT NULL DEFAULT 'none', `createdBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_denials_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoiceHeaders`(`id`),
  CONSTRAINT `fk_denials_line` FOREIGN KEY (`invoiceLineId`) REFERENCES `invoiceLines`(`id`)
);

CREATE TABLE IF NOT EXISTS `adjustments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `invoiceId` INT NULL, `amount` DECIMAL(12,2) NOT NULL, `reason` TEXT NULL, `createdBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_adjustments_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoiceHeaders`(`id`)
);

CREATE TABLE IF NOT EXISTS `recoupments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `invoiceId` INT NULL, `amount` DECIMAL(12,2) NOT NULL, `reason` TEXT NULL, `recoupedAt` TIMESTAMP NULL, `createdBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_recoupments_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoiceHeaders`(`id`)
);

CREATE TABLE IF NOT EXISTS `billingHolds` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `submissionId` INT NULL, `invoiceId` INT NULL, `reason` TEXT NOT NULL, `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `placedBy` INT NULL, `releasedBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `releasedAt` TIMESTAMP NULL,
  INDEX `idx_billingHolds_submissionId` (`submissionId`),
  CONSTRAINT `fk_billingHolds_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_billingHolds_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoiceHeaders`(`id`)
);

-- ─── Self-audit & CAPA ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `audits` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `title` VARCHAR(256) NOT NULL, `auditType` VARCHAR(64) NOT NULL,
  `status` ENUM('planning','fieldwork','review','closed') NOT NULL DEFAULT 'planning', `periodStart` TIMESTAMP NULL, `periodEnd` TIMESTAMP NULL, `leadAuditorId` INT NULL,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active', `version` INT NOT NULL DEFAULT 1, `createdBy` INT NULL, `closedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_audits_lead` FOREIGN KEY (`leadAuditorId`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_audits_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `auditScopes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `auditId` INT NOT NULL, `description` TEXT NULL, `requirementVersionId` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_auditScopes_audit` FOREIGN KEY (`auditId`) REFERENCES `audits`(`id`),
  CONSTRAINT `fk_auditScopes_req` FOREIGN KEY (`requirementVersionId`) REFERENCES `requirementVersions`(`id`)
);

CREATE TABLE IF NOT EXISTS `auditPopulations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `auditId` INT NOT NULL, `description` VARCHAR(256) NULL, `totalCount` INT NOT NULL DEFAULT 0, `totalAmount` DECIMAL(14,2) NULL, `snapshot` JSON NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_auditPopulations_audit` FOREIGN KEY (`auditId`) REFERENCES `audits`(`id`)
);

CREATE TABLE IF NOT EXISTS `auditSamples` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `auditId` INT NOT NULL, `populationId` INT NOT NULL,
  `method` ENUM('full_population','random','stratified','risk_based','dollar_based','judgmental') NOT NULL, `seed` INT NULL, `size` INT NOT NULL DEFAULT 0,
  `selectionDate` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `selectedIds` JSON NULL, `excludedIds` JSON NULL, `exclusionReasons` JSON NULL, `createdBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_auditSamples_audit` FOREIGN KEY (`auditId`) REFERENCES `audits`(`id`),
  CONSTRAINT `fk_auditSamples_population` FOREIGN KEY (`populationId`) REFERENCES `auditPopulations`(`id`)
);

CREATE TABLE IF NOT EXISTS `auditTests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `auditId` INT NOT NULL, `sampleId` INT NULL, `sampleItemId` VARCHAR(64) NULL, `requirementVersionId` INT NULL,
  `result` ENUM('pass','fail','observation','not_applicable','insufficient_evidence','pending_clarification') NOT NULL DEFAULT 'pending_clarification',
  `financialExposure` DECIMAL(12,2) NULL, `note` TEXT NULL, `testedBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_auditTests_auditId` (`auditId`),
  CONSTRAINT `fk_auditTests_audit` FOREIGN KEY (`auditId`) REFERENCES `audits`(`id`),
  CONSTRAINT `fk_auditTests_sample` FOREIGN KEY (`sampleId`) REFERENCES `auditSamples`(`id`)
);

CREATE TABLE IF NOT EXISTS `auditWorkpapers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `auditId` INT NOT NULL, `title` VARCHAR(256) NULL, `documentId` INT NULL, `createdBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_auditWorkpapers_audit` FOREIGN KEY (`auditId`) REFERENCES `audits`(`id`),
  CONSTRAINT `fk_auditWorkpapers_doc` FOREIGN KEY (`documentId`) REFERENCES `complianceDocuments`(`id`)
);

CREATE TABLE IF NOT EXISTS `auditEvidence` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `auditTestId` INT NOT NULL, `documentId` INT NULL, `note` TEXT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_auditEvidence_test` FOREIGN KEY (`auditTestId`) REFERENCES `auditTests`(`id`),
  CONSTRAINT `fk_auditEvidence_doc` FOREIGN KEY (`documentId`) REFERENCES `complianceDocuments`(`id`)
);

CREATE TABLE IF NOT EXISTS `auditFindings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `findingNumber` VARCHAR(64) NULL, `auditId` INT NOT NULL, `submissionId` INT NULL, `requirementVersionId` INT NULL,
  `conditionFound` TEXT NULL, `expectedCondition` TEXT NULL, `cause` TEXT NULL, `effect` TEXT NULL, `risk` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `financialExposure` DECIMAL(12,2) NULL, `repeatFinding` BOOLEAN NOT NULL DEFAULT FALSE, `responsibleOwnerId` INT NULL,
  `state` ENUM('open','management_response','corrective_action','follow_up','closed','reopened') NOT NULL DEFAULT 'open',
  `dueDate` TIMESTAMP NULL, `closureApprovedBy` INT NULL, `reopenCount` INT NOT NULL DEFAULT 0,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active', `version` INT NOT NULL DEFAULT 1, `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_auditFindings_auditId` (`auditId`),
  CONSTRAINT `fk_auditFindings_audit` FOREIGN KEY (`auditId`) REFERENCES `audits`(`id`),
  CONSTRAINT `fk_auditFindings_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_auditFindings_owner` FOREIGN KEY (`responsibleOwnerId`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_auditFindings_closer` FOREIGN KEY (`closureApprovedBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `managementResponses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `findingId` INT NOT NULL, `response` TEXT NOT NULL, `respondedBy` INT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_managementResponses_finding` FOREIGN KEY (`findingId`) REFERENCES `auditFindings`(`id`)
);

CREATE TABLE IF NOT EXISTS `correctiveActions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `findingId` INT NOT NULL, `immediateCorrection` TEXT NULL, `rootCauseAnalysis` TEXT NULL, `correctiveAction` TEXT NULL, `preventiveAction` TEXT NULL,
  `dueDate` TIMESTAMP NULL, `completed` BOOLEAN NOT NULL DEFAULT FALSE, `completedAt` TIMESTAMP NULL, `ownerId` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_correctiveActions_findingId` (`findingId`),
  CONSTRAINT `fk_correctiveActions_finding` FOREIGN KEY (`findingId`) REFERENCES `auditFindings`(`id`)
);

CREATE TABLE IF NOT EXISTS `correctiveActionEvidence` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `correctiveActionId` INT NOT NULL, `documentId` INT NULL, `note` TEXT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_correctiveActionEvidence_ca` FOREIGN KEY (`correctiveActionId`) REFERENCES `correctiveActions`(`id`),
  CONSTRAINT `fk_correctiveActionEvidence_doc` FOREIGN KEY (`documentId`) REFERENCES `complianceDocuments`(`id`)
);

CREATE TABLE IF NOT EXISTS `followUpTests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `findingId` INT NOT NULL,
  `result` ENUM('pass','fail','observation','not_applicable','insufficient_evidence','pending_clarification') NOT NULL DEFAULT 'pending_clarification',
  `testedBy` INT NULL, `note` TEXT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_followUpTests_findingId` (`findingId`),
  CONSTRAINT `fk_followUpTests_finding` FOREIGN KEY (`findingId`) REFERENCES `auditFindings`(`id`)
);

CREATE TABLE IF NOT EXISTS `auditApprovals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `auditId` INT NOT NULL, `approverId` INT NULL, `approvalType` VARCHAR(64) NOT NULL, `note` TEXT NULL, `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_auditApprovals_audit` FOREIGN KEY (`auditId`) REFERENCES `audits`(`id`),
  CONSTRAINT `fk_auditApprovals_approver` FOREIGN KEY (`approverId`) REFERENCES `users`(`id`)
);

-- ─── Overpayments ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `overpaymentCases` (
  `id` INT AUTO_INCREMENT PRIMARY KEY, `discoveryDate` TIMESTAMP NULL, `discoverySource` VARCHAR(256) NULL, `periodStart` TIMESTAMP NULL, `periodEnd` TIMESTAMP NULL,
  `preliminaryAmount` DECIMAL(14,2) NULL, `finalAmount` DECIMAL(14,2) NULL, `calculationMethodology` TEXT NULL, `rootCause` TEXT NULL,
  `legalReviewStatus` ENUM('not_started','in_review','complete') NOT NULL DEFAULT 'not_started', `complianceReviewStatus` ENUM('not_started','in_review','complete') NOT NULL DEFAULT 'not_started',
  `repaymentDeadline` TIMESTAMP NULL, `selfDisclosureEvaluation` TEXT NULL, `status` ENUM('open','under_review','resolved','closed') NOT NULL DEFAULT 'open',
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active', `version` INT NOT NULL DEFAULT 1, `createdBy` INT NULL, `closureApprovedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_overpaymentCases_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_overpaymentCases_closer` FOREIGN KEY (`closureApprovedBy`) REFERENCES `users`(`id`)
);
