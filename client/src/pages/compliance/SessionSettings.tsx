import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Monitor, Loader2, LogOut, ShieldOff } from "lucide-react";
import { toast } from "sonner";

/**
 * Active sessions / devices. Lists the caller's own sessions and lets them
 * revoke any one, or sign out of every other session at once. Revocation only
 * takes effect for access control when COMPLIANCE_SESSIONS is enforced; the
 * records are always shown so the user can see where they are signed in.
 */
export default function SessionSettings() {
  const utils = trpc.useUtils();
  const list = trpc.compliance.sessions.list.useQuery();
  const revoke = trpc.compliance.sessions.revoke.useMutation({
    onSuccess: () => { utils.compliance.sessions.list.invalidate(); toast.success("Session revoked"); },
    onError: (e) => toast.error(e.message),
  });
  const revokeOthers = trpc.compliance.sessions.revokeOthers.useMutation({
    onSuccess: (r) => { utils.compliance.sessions.list.invalidate(); toast.success(`Signed out ${r.count} other session(s)`); },
    onError: (e) => toast.error(e.message),
  });

  const fmt = (d: string | Date) => new Date(d).toLocaleString();

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Monitor className="h-6 w-6 text-green-700" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-slate-900">Active Sessions</h1>
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="gap-1" disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
            {revokeOthers.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldOff className="h-4 w-4" aria-hidden="true" />}
            Sign out all other sessions
          </Button>
        </div>

        {list.isLoading && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>}
        {list.isError && <p className="text-sm text-slate-500">Unable to load sessions (database unavailable).</p>}
        {list.data && list.data.length === 0 && <p className="text-sm text-slate-500">No sessions recorded.</p>}

        <div className="space-y-2">
          {(list.data ?? []).map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <span className="font-mono text-xs text-slate-700">{(s.userAgent ?? "Unknown device").slice(0, 60)}</span>
                    {s.current && <Badge>This device</Badge>}
                    {s.active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">{s.revokedAt ? "Revoked" : "Expired"}</Badge>}
                    {s.mfaVerified && <Badge variant="secondary">MFA</Badge>}
                  </span>
                  {s.active && !s.current && (
                    <Button size="sm" variant="ghost" className="gap-1" disabled={revoke.isPending} onClick={() => revoke.mutate({ sessionId: s.sessionId })}>
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Revoke
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                <span>IP: {s.ip ?? "—"}</span>
                <span>Signed in: {fmt(s.createdAt)}</span>
                <span>Last active: {fmt(s.lastSeenAt)}</span>
                <span>Expires: {fmt(s.expiresAt)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
