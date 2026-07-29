import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { LogOut, UserCheck } from "lucide-react";
import { toast } from "sonner";

export function ImpersonationBanner() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();

  // Only query impersonation status when a staff user is authenticated.
  // Without this guard, the query fires on the login page (unauthenticated),
  // throws UNAUTHED_ERR_MSG, and the global error handler in main.tsx
  // redirects to /admin — creating an infinite blink/reload loop.
  const isStaff = !loading && !!user && ["admin", "super_admin", "worker", "viewer", "assessor"].includes(user.role);

  const statusQuery = trpc.impersonate.status.useQuery(undefined, {
    enabled: isStaff,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const stopMutation = trpc.impersonate.stop.useMutation({
    onSuccess: () => {
      toast.success("Returned to your admin session");
      utils.auth.me.invalidate();
      window.location.href = "/admin/workers";
    },
    onError: (err) => toast.error(err.message),
  });

  if (!statusQuery.data?.isImpersonating) return null;

  const { originalAdminName, currentUserName, currentUserRole } = statusQuery.data;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-indigo-600 text-white px-4 py-2 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <UserCheck className="w-4 h-4 shrink-0" />
        <span>
          You are viewing as <strong>{currentUserName}</strong>
          {currentUserRole && <span className="ml-1 text-indigo-200 text-xs">({currentUserRole})</span>}
          {originalAdminName && (
            <span className="text-indigo-200 ml-2 text-xs hidden sm:inline">
              — logged in as {originalAdminName}
            </span>
          )}
        </span>
      </div>
      <button
        onClick={() => stopMutation.mutate()}
        disabled={stopMutation.isPending}
        className="flex items-center gap-1.5 bg-white text-indigo-700 hover:bg-indigo-50 px-3 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
      >
        <LogOut className="w-3.5 h-3.5" />
        Exit — Return to My Account
      </button>
    </div>
  );
}
