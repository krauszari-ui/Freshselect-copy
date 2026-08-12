-- Rollback for 0043_vendor_pod.sql
DROP TABLE IF EXISTS `vendorPods`;
ALTER TABLE `submissions` DROP COLUMN `assignedVendorOrgId`;
ALTER TABLE `organizations` DROP COLUMN `kind`;
