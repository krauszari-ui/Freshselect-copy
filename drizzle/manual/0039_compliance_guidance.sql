-- ════════════════════════════════════════════════════════════════════════════
-- Compliance module — Guidance & clarification library (additive, idempotent)
-- Source of truth: drizzle/schema.ts. Rollback: 0039_compliance_guidance.down.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `guidanceDocuments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(256) NOT NULL,
  `sourceOrganization` VARCHAR(128) NULL,
  `sourceType` ENUM('cms','nysdoh_ohip','omig','scn','mco','contract','attorney','consultant','other') NOT NULL DEFAULT 'other',
  `privileged` BOOLEAN NOT NULL DEFAULT FALSE,
  `currentVersion` INT NOT NULL DEFAULT 1,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active',
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_guidanceDocuments_sourceType` (`sourceType`),
  CONSTRAINT `fk_guidanceDocuments_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `guidanceVersions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `guidanceDocumentId` INT NOT NULL,
  `version` INT NOT NULL,
  `summary` TEXT NULL,
  `sourceUrl` VARCHAR(512) NULL,
  `section` VARCHAR(128) NULL,
  `documentId` INT NULL,
  `effectiveDate` TIMESTAMP NULL,
  `endDate` TIMESTAMP NULL,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_guidanceVersions` (`guidanceDocumentId`,`version`),
  CONSTRAINT `fk_guidanceVersions_doc` FOREIGN KEY (`guidanceDocumentId`) REFERENCES `guidanceDocuments`(`id`),
  CONSTRAINT `fk_guidanceVersions_cdoc` FOREIGN KEY (`documentId`) REFERENCES `complianceDocuments`(`id`)
);

CREATE TABLE IF NOT EXISTS `clarificationRequests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `question` TEXT NOT NULL,
  `facts` TEXT NULL,
  `submissionId` INT NULL,
  `requirementVersionId` INT NULL,
  `controllingGuidanceId` INT NULL,
  `status` ENUM('submitted','facts_recorded','legal_requested','sent_to_agency','answered','interpreted','closed') NOT NULL DEFAULT 'submitted',
  `sentToOrganization` VARCHAR(128) NULL,
  `privileged` BOOLEAN NOT NULL DEFAULT FALSE,
  `recordStatus` ENUM('active','archived','voided','superseded') NOT NULL DEFAULT 'active',
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_clarificationRequests_status` (`status`),
  CONSTRAINT `fk_clarificationRequests_submission` FOREIGN KEY (`submissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_clarificationRequests_req` FOREIGN KEY (`requirementVersionId`) REFERENCES `requirementVersions`(`id`),
  CONSTRAINT `fk_clarificationRequests_guidance` FOREIGN KEY (`controllingGuidanceId`) REFERENCES `guidanceDocuments`(`id`)
);

CREATE TABLE IF NOT EXISTS `agencyResponses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clarificationRequestId` INT NOT NULL,
  `organization` VARCHAR(128) NULL,
  `responseType` ENUM('formal','informal') NOT NULL DEFAULT 'informal',
  `documentId` INT NULL,
  `summary` TEXT NULL,
  `receivedAt` TIMESTAMP NULL,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_agencyResponses_clar` FOREIGN KEY (`clarificationRequestId`) REFERENCES `clarificationRequests`(`id`),
  CONSTRAINT `fk_agencyResponses_doc` FOREIGN KEY (`documentId`) REFERENCES `complianceDocuments`(`id`)
);

CREATE TABLE IF NOT EXISTS `legalReviews` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clarificationRequestId` INT NULL,
  `requirementVersionId` INT NULL,
  `attorneyId` INT NULL,
  `privileged` BOOLEAN NOT NULL DEFAULT TRUE,
  `workProduct` BOOLEAN NOT NULL DEFAULT TRUE,
  `summary` TEXT NULL,
  `status` ENUM('requested','in_review','complete') NOT NULL DEFAULT 'requested',
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_legalReviews_clar` FOREIGN KEY (`clarificationRequestId`) REFERENCES `clarificationRequests`(`id`),
  CONSTRAINT `fk_legalReviews_req` FOREIGN KEY (`requirementVersionId`) REFERENCES `requirementVersions`(`id`),
  CONSTRAINT `fk_legalReviews_attorney` FOREIGN KEY (`attorneyId`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `internalDecisions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clarificationRequestId` INT NULL,
  `interpretation` TEXT NOT NULL,
  `basis` TEXT NULL,
  `approvedBy` INT NULL,
  `approvedAt` TIMESTAMP NULL,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_internalDecisions_clar` FOREIGN KEY (`clarificationRequestId`) REFERENCES `clarificationRequests`(`id`),
  CONSTRAINT `fk_internalDecisions_approvedBy` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`)
);

CREATE TABLE IF NOT EXISTS `policyChangeImpacts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `internalDecisionId` INT NOT NULL,
  `requirementVersionId` INT NULL,
  `affectedSubmissionId` INT NULL,
  `affectedInvoiceId` INT NULL,
  `note` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_policyChangeImpacts_internalDecisionId` (`internalDecisionId`),
  CONSTRAINT `fk_policyChangeImpacts_decision` FOREIGN KEY (`internalDecisionId`) REFERENCES `internalDecisions`(`id`),
  CONSTRAINT `fk_policyChangeImpacts_req` FOREIGN KEY (`requirementVersionId`) REFERENCES `requirementVersions`(`id`),
  CONSTRAINT `fk_policyChangeImpacts_submission` FOREIGN KEY (`affectedSubmissionId`) REFERENCES `submissions`(`id`),
  CONSTRAINT `fk_policyChangeImpacts_invoice` FOREIGN KEY (`affectedInvoiceId`) REFERENCES `invoiceHeaders`(`id`)
);

CREATE TABLE IF NOT EXISTS `trainingAcknowledgments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `internalDecisionId` INT NULL,
  `guidanceDocumentId` INT NULL,
  `userId` INT NOT NULL,
  `acknowledgedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_trainingAcknowledgments` (`internalDecisionId`,`userId`),
  CONSTRAINT `fk_trainingAcknowledgments_decision` FOREIGN KEY (`internalDecisionId`) REFERENCES `internalDecisions`(`id`),
  CONSTRAINT `fk_trainingAcknowledgments_guidance` FOREIGN KEY (`guidanceDocumentId`) REFERENCES `guidanceDocuments`(`id`),
  CONSTRAINT `fk_trainingAcknowledgments_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
);
