import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/** Route path → human-readable title */
const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/clients": "Clients List",
  "/admin/workers": "Workers",
  "/admin/tasks": "Tasks",
  "/admin/documents": "Documents",
  "/admin/agency": "Agency",
  "/admin/referrals": "Referrals",
  "/admin/duplicates": "Duplicates",
  "/admin/assessment-report": "Assessment Report",
  "/admin/notifications": "Notifications",
  "/admin/audit-log": "Audit Log",
  "/assessor": "Assessor Portal",
  "/referrer": "Referrer Portal",
};

function getTitle(path: string): string {
  if (PAGE_TITLES[path]) return PAGE_TITLES[path];
  const clientMatch = path.match(/^\/admin\/clients\/(\d+)/);
  if (clientMatch) return `Client #${clientMatch[1]}`;
  const appMatch = path.match(/^\/admin\/application\/(\d+)/);
  if (appMatch) return `Application #${appMatch[1]}`;
  return path;
}

/**
 * Fires a page_view audit log entry on every route change.
 * Only active when the user is authenticated (staff only).
 */
export function usePageViewLogger() {
  const [location] = useLocation();
  const { user } = useAuth();
  const logPageView = trpc.auditLog.logPageView.useMutation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    // Only log for authenticated staff on admin/assessor paths
    if (!user) return;
    if (!location.startsWith("/admin") && !location.startsWith("/assessor")) return;
    // Skip login/auth pages
    if (location === "/admin" || location === "/admin/login" || location.startsWith("/admin/forgot") || location.startsWith("/admin/reset")) return;
    // Debounce: don't re-log the same path twice in a row
    if (lastPath.current === location) return;
    lastPath.current = location;

    logPageView.mutate({ path: location, title: getTitle(location) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, user?.id]);
}
