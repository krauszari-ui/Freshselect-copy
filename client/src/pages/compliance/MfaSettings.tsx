import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2, KeyRound, Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Self-service MFA (TOTP) enrollment. The user starts enrollment (server mints a
 * secret + otpauth URI), adds it to an authenticator app, then confirms with a
 * live code. On confirmation the server returns one-time recovery codes shown
 * exactly once. Enforcement at login is separate (COMPLIANCE_MFA flag); this
 * page only manages the user's own second factor.
 */
export default function MfaSettings() {
  const utils = trpc.useUtils();
  const status = trpc.compliance.mfa.status.useQuery();
  const [enrolling, setEnrolling] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [token, setToken] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const start = trpc.compliance.mfa.start.useMutation({
    onSuccess: (d) => { setEnrolling(d); setRecoveryCodes(null); },
    onError: (e) => toast.error(e.message),
  });
  const confirm = trpc.compliance.mfa.confirm.useMutation({
    onSuccess: (d) => {
      setRecoveryCodes(d.recoveryCodes);
      setEnrolling(null);
      setToken("");
      utils.compliance.mfa.status.invalidate();
      toast.success("MFA enabled");
    },
    onError: (e) => toast.error(e.message.replace(/^.*(MFA_CODE_INVALID).*$/, "Invalid code — try again")),
  });
  const requestReset = trpc.compliance.mfa.requestReset.useMutation({
    onSuccess: () => { utils.compliance.mfa.status.invalidate(); toast.success("Reset requested — an administrator must approve it."); },
    onError: (e) => toast.error(e.message),
  });

  const copy = (text: string) => { navigator.clipboard?.writeText(text); toast.message("Copied"); };

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-green-700" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-slate-900">Two-Factor Authentication</h1>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Status</span>
              {status.data && (
                <span className="flex gap-1.5">
                  {status.data.active
                    ? <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Enabled</Badge>
                    : <Badge variant="outline">Not enabled</Badge>}
                  {status.data.required && <Badge variant="secondary">Required for your role</Badge>}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {status.isLoading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>}
            {status.isError && <p className="text-slate-500">Unable to load status (database unavailable).</p>}

            {status.data && !status.data.active && !enrolling && !recoveryCodes && (
              <div className="space-y-2">
                <p className="text-slate-600">Protect your account with a time-based one-time code from an authenticator app (Google Authenticator, Authy, 1Password, etc.).</p>
                <Button size="sm" className="gap-1" disabled={start.isPending} onClick={() => start.mutate()}>
                  {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />} Set up authenticator
                </Button>
              </div>
            )}

            {enrolling && (
              <div className="space-y-3">
                <p className="text-slate-600">1. Add this account to your authenticator app. Scan the URI as a QR in your app, or enter the secret key manually.</p>
                <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                  <div>
                    <Label className="text-xs text-slate-500">Secret key</Label>
                    <div className="flex items-center gap-2">
                      <code className="text-xs break-all font-mono text-slate-800">{enrolling.secret}</code>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copy(enrolling.secret)}><Copy className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">otpauth URI</Label>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] break-all font-mono text-slate-600">{enrolling.otpauthUri}</code>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copy(enrolling.otpauthUri)}><Copy className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                    </div>
                  </div>
                </div>
                <p className="text-slate-600">2. Enter the current 6-digit code to confirm.</p>
                <div className="flex items-end gap-2">
                  <div>
                    <Label htmlFor="mfacode" className="text-xs">Code</Label>
                    <Input id="mfacode" className="h-8 w-32" inputMode="numeric" placeholder="123456" value={token}
                      onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 8))} />
                  </div>
                  <Button size="sm" disabled={confirm.isPending || token.length < 6} onClick={() => confirm.mutate({ token })}>
                    {confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Confirm & enable"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEnrolling(null); setToken(""); }}>Cancel</Button>
                </div>
              </div>
            )}

            {recoveryCodes && (
              <div className="space-y-2">
                <p className="font-medium text-slate-800">Save your recovery codes</p>
                <p className="text-slate-600">Each code works once if you lose your authenticator. Store them somewhere safe — they will not be shown again.</p>
                <div className="grid grid-cols-2 gap-1.5 rounded-md border bg-slate-50 p-3 font-mono text-xs">
                  {recoveryCodes.map((c) => <span key={c} className="text-slate-800">{c}</span>)}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => copy(recoveryCodes.join("\n"))}><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy all</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRecoveryCodes(null)}>Done</Button>
                </div>
              </div>
            )}

            {status.data?.active && !recoveryCodes && (
              <div className="pt-2 border-t">
                <p className="text-slate-600 mb-2">Lost your device? Request a reset — a compliance administrator must approve it, after which you can re-enroll.</p>
                <Button size="sm" variant="outline" disabled={requestReset.isPending} onClick={() => requestReset.mutate()}>
                  {requestReset.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Request MFA reset"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
