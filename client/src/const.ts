export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Returns the admin login page path.
 * Uses internal email/password authentication at /admin.
 */
export const getLoginUrl = (): string => "/admin";
