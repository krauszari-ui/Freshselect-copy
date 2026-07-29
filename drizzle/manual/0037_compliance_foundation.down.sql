-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 0037_compliance_foundation.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Drops ONLY the compliance-module tables. No existing application table is
-- touched. Because the migration is additive and feature-flagged OFF by default,
-- the safest production rollback is simply to disable the flags
-- (COMPLIANCE_MODULE/COMPLIANCE_GATES/COMPLIANCE_MFA) — the tables can remain in
-- place with zero effect on the existing app. Use this script only for a full
-- teardown in a lower environment.
--
-- Order matters: drop children before parents to satisfy foreign keys.
-- ════════════════════════════════════════════════════════════════════════════
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `complianceReadiness`;
DROP TABLE IF EXISTS `requirementApprovals`;
DROP TABLE IF EXISTS `requirementExceptions`;
DROP TABLE IF EXISTS `requirementReviews`;
DROP TABLE IF EXISTS `requirementEvidence`;
DROP TABLE IF EXISTS `requirementAssignments`;
DROP TABLE IF EXISTS `requirementApplicabilityRules`;
DROP TABLE IF EXISTS `requirementVersions`;
DROP TABLE IF EXISTS `requirementDefinitions`;
DROP TABLE IF EXISTS `serviceAuthorizations`;
DROP TABLE IF EXISTS `scnReferrals`;
DROP TABLE IF EXISTS `enrollmentEpisodes`;
DROP TABLE IF EXISTS `eligibilityVerifications`;
DROP TABLE IF EXISTS `documentAccessLog`;
DROP TABLE IF EXISTS `complianceDocuments`;
DROP TABLE IF EXISTS `uploadTokens`;
DROP TABLE IF EXISTS `jobs`;
DROP TABLE IF EXISTS `mfaRecoveryCodes`;
DROP TABLE IF EXISTS `mfaEnrollments`;
DROP TABLE IF EXISTS `tempAccessGrants`;
DROP TABLE IF EXISTS `recordScopes`;
DROP TABLE IF EXISTS `userComplianceRoles`;
DROP TABLE IF EXISTS `rolePermissions`;
DROP TABLE IF EXISTS `compliancePermissions`;
DROP TABLE IF EXISTS `complianceRoles`;
DROP TABLE IF EXISTS `auditEvents`;

SET FOREIGN_KEY_CHECKS = 1;
