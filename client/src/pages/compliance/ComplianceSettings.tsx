import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, KeyRound, Monitor, Bell, Loader2, Unlock, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Compliance security settings hub: break-glass emergency access, notifications,
 * and links to the MFA and active-sessions pages. Break-glass activation is
 * audited and notifies oversight; use it only for genuine emergencies.
 */
export default function ComplianceSettings() {
  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-green-700" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-slate-900">Compliance Security Settings</h1>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/admin/compliance/mfa">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-green-700" aria-hidden="true" /> Two-factor authentication</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-600">Manage your authenticator and recovery codes.</CardContent>
            </Card>
          </Link>
          <Link href="/admin/compliance/sessions">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Monitor className="h-4 w-4 text-green-700" aria-hidden="true" /> Active sessions</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-600">See your devices and revoke access.</CardContent>
            </Card>
          </Link>
        </div>

        <BreakGlassPanel />
        <NotificationsPanel />
      </div>
    </AdminLayout>
  );
}

function BreakGlassPanel() {
  const utils = trpc.useUtils();
  const active = trpc.compliance.breakGlass.active.useQuery();
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("");
  const [ttl, setTtl] = useState(60);
  const activate = trpc.compliance.breakGlass.activate.useMutation({
    onSuccess: () => { setReason(""); setScope(""); utils.compliance.breakGlass.active.invalidate(); toast.success("Break-glass access activated — oversight has been notified."); },
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.compliance.breakGlass.revoke.useMutation({
    onSuccess: () => { utils.compliance.breakGlass.active.invalidate(); toast.success("Break-glass access revoked"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Unlock className="h-4 w-4 text-amber-600" aria-hidden="true" /> Break-glass emergency access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-slate-600">
          For genuine emergencies only. Activating break-glass access is recorded in the
          tamper-evident audit log, notifies oversight immediately, and auto-expires. It does
          not guarantee any particular permission — it is a heavily-audited, time-boxed elevation.
        </p>

        {(active.data ?? []).length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
            {(active.data ?? []).map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2">
                <span className="text-amber-800">
                  <Badge variant="outline" className="mr-2">Active</Badge>
                  {g.scope} — expires {new Date(g.expiresAt).toLocaleString()}
                </span>
                <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate({ grantId: g.id })}>Revoke</Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div><Label htmlFor="bgscope" className="text-xs">Scope (what you need access to)</Label><Input id="bgscope" className="h-8" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="e.g. Client #1234 billing records" /></div>
          <div><Label htmlFor="bgreason" className="text-xs">Justification (min 10 chars)</Label><Textarea id="bgreason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why normal access is insufficient right now" /></div>
          <div className="flex items-end gap-2">
            <div><Label htmlFor="bgttl" className="text-xs">Minutes (5–240)</Label><Input id="bgttl" type="number" className="h-8 w-24" min={5} max={240} value={ttl} onChange={(e) => setTtl(Number(e.target.value))} /></div>
            <Button size="sm" variant="outline" className="gap-1 border-amber-400 text-amber-800" disabled={activate.isPending || reason.length < 10 || scope.length < 2}
              onClick={() => activate.mutate({ reason, scope, ttlMinutes: ttl })}>
              {activate.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />} Activate break-glass
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationsPanel() {
  const utils = trpc.useUtils();
  const list = trpc.compliance.notifications.list.useQuery(undefined);
  const markAll = trpc.compliance.notifications.markAllRead.useMutation({
    onSuccess: () => { utils.compliance.notifications.list.invalidate(); utils.compliance.notifications.unreadCount.invalidate(); },
  });
  const markRead = trpc.compliance.notifications.markRead.useMutation({
    onSuccess: () => { utils.compliance.notifications.list.invalidate(); utils.compliance.notifications.unreadCount.invalidate(); },
  });
  const rows = list.data ?? [];
  const unread = rows.filter((n) => !n.readAt).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><Bell className="h-4 w-4 text-green-700" aria-hidden="true" /> Notifications {unread > 0 && <Badge>{unread}</Badge>}</span>
          {unread > 0 && <Button size="sm" variant="ghost" disabled={markAll.isPending} onClick={() => markAll.mutate()}>Mark all read</Button>}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {list.isLoading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>}
        {list.isError && <p className="text-slate-500">Unable to load notifications.</p>}
        {rows.length === 0 && !list.isLoading && <p className="text-slate-500">No notifications.</p>}
        <ul className="divide-y">
          {rows.map((n) => (
            <li key={n.id} className={`py-2 flex items-start justify-between gap-2 ${n.readAt ? "opacity-60" : ""}`}>
              <span>
                <Badge variant={n.severity === "critical" ? "destructive" : n.severity === "warning" ? "default" : "secondary"} className="mr-2">{n.severity}</Badge>
                <span className="font-medium text-slate-800">{n.title}</span>
                {n.body && <span className="block text-xs text-slate-500 mt-0.5">{n.body}</span>}
                <span className="block text-[11px] text-slate-400 mt-0.5">{new Date(n.createdAt).toLocaleString()}</span>
              </span>
              {!n.readAt && <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => markRead.mutate({ id: n.id })}><Check className="h-3.5 w-3.5" aria-hidden="true" /></Button>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
