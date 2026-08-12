-- ROLLBACK for 0039_compliance_guidance.sql — drops only the guidance tables.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `trainingAcknowledgments`;
DROP TABLE IF EXISTS `policyChangeImpacts`;
DROP TABLE IF EXISTS `internalDecisions`;
DROP TABLE IF EXISTS `legalReviews`;
DROP TABLE IF EXISTS `agencyResponses`;
DROP TABLE IF EXISTS `clarificationRequests`;
DROP TABLE IF EXISTS `guidanceVersions`;
DROP TABLE IF EXISTS `guidanceDocuments`;
SET FOREIGN_KEY_CHECKS = 1;
