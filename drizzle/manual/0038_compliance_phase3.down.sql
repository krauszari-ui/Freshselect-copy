-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 0038_compliance_phase3.sql — drops only Phase 3 tables.
-- As with Phase 1/2, the flag-off posture is the preferred production rollback;
-- this teardown is for lower environments. Children dropped before parents.
-- ════════════════════════════════════════════════════════════════════════════
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `overpaymentCases`;
DROP TABLE IF EXISTS `auditApprovals`;
DROP TABLE IF EXISTS `followUpTests`;
DROP TABLE IF EXISTS `correctiveActionEvidence`;
DROP TABLE IF EXISTS `correctiveActions`;
DROP TABLE IF EXISTS `managementResponses`;
DROP TABLE IF EXISTS `auditFindings`;
DROP TABLE IF EXISTS `auditEvidence`;
DROP TABLE IF EXISTS `auditWorkpapers`;
DROP TABLE IF EXISTS `auditTests`;
DROP TABLE IF EXISTS `auditSamples`;
DROP TABLE IF EXISTS `auditPopulations`;
DROP TABLE IF EXISTS `auditScopes`;
DROP TABLE IF EXISTS `audits`;
DROP TABLE IF EXISTS `billingHolds`;
DROP TABLE IF EXISTS `recoupments`;
DROP TABLE IF EXISTS `adjustments`;
DROP TABLE IF EXISTS `denials`;
DROP TABLE IF EXISTS `paymentAllocations`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `invoiceSubmissions`;
DROP TABLE IF EXISTS `invoiceLines`;
DROP TABLE IF EXISTS `invoiceHeaders`;
DROP TABLE IF EXISTS `serviceAmendments`;
DROP TABLE IF EXISTS `deliveryAttempts`;
DROP TABLE IF EXISTS `deliveries`;
DROP TABLE IF EXISTS `serviceEncounters`;
DROP TABLE IF EXISTS `servicePlans`;
DROP TABLE IF EXISTS `clinicalApprovals`;
DROP TABLE IF EXISTS `nutritionPlanVersions`;
DROP TABLE IF EXISTS `nutritionPlans`;
DROP TABLE IF EXISTS `nutritionAssessments`;

SET FOREIGN_KEY_CHECKS = 1;
