import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ShieldCheck, ShieldAlert, BookOpen, BookMarked, BarChart3, Users, Loader2, CheckCircle2, XCircle, Info, Search, KeyRound, Monitor, Settings } from "lucide-react";

/**
 * Executive compliance dashboard. Cards deep-link to the underlying records.
 * Status is always conveyed with an icon + text label, never color alone
 * (WCAG 1.4.1). The system explicitly does NOT guarantee compliance/reimbursement.
 */
export default function ComplianceDashboard() {
  const flags = trpc.compliance.flags.useQuery();
  const integrity = trpc.compliance.audit.verifyIntegrity.useQuery(undefined, {
    enabled: flags.data?.module === true,
    retry: false,
  });

  if (flags.data && flags.data.module === false) {
    return (
      <AdminLayout>
        <div className="max-w-3xl mx-auto p-6">
          <Card>
            <CardHeader><CardTitle>Compliance module is disabled</CardTitle></CardHeader>
            <CardContent className="text-sm text-slate-600">
              Set <code>COMPLIANCE_MODULE=1</code> in the server environment to enable the compliance
              and audit module. It is off by default so the existing application is unaffected.
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-green-700" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Compliance & Audit</h1>
            <p className="text-sm text-slate-600">Program integrity, evidence, and self-audit workspace.</p>
          </div>
        </div>

        {/* Non-guarantee disclaimer — required, prominent. */}
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            This system helps track compliance requirements and evidence. It does <strong>not</strong> guarantee
            compliance or reimbursement, and does not determine whether a legal repayment or self-disclosure
            obligation exists. Qualified compliance and legal personnel must review these matters.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Audit-log integrity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {integrity.isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : integrity.data?.ok
                  ? <CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" />
                  : <ShieldAlert className="h-4 w-4 text-red-700" aria-hidden="true" />}
                Audit-log integrity
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {integrity.isLoading && <span className="text-slate-500">Verifying hash chain…</span>}
              {integrity.isError && <span className="text-slate-500">Unable to verify (database unavailable).</span>}
              {integrity.data && (
                integrity.data.ok
                  ? <span className="text-slate-700">Chain verified — {integrity.data.count} event(s), no tampering detected.</span>
                  : <span className="text-red-700 font-medium">Tampering detected at event #{integrity.data.brokenAtId} ({integrity.data.reason}).</span>
              )}
            </CardContent>
          </Card>

          {/* Requirements library */}
          <Link href="/admin/compliance/requirements">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-green-700" aria-hidden="true" /> Requirements library
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                View and author versioned compliance requirements and applicability rules.
              </CardContent>
            </Card>
          </Link>

          {/* Client readiness (links to client list) */}
          <Link href="/admin/clients">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-700" aria-hidden="true" /> Client readiness
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Open a client to view their compliance record: eligibility, referrals, authorizations,
                nutrition, requirements, deliveries, billing, and derived readiness.
              </CardContent>
            </Card>
          </Link>

          {/* Guidance & clarification library */}
          <Link href="/admin/compliance/guidance">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookMarked className="h-4 w-4 text-green-700" aria-hidden="true" /> Guidance & clarifications
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Source guidance and the clarification workflow for unclear requirements; privileged
                legal records are access-restricted.
              </CardContent>
            </Card>
          </Link>

          {/* Reports */}
          <Link href="/admin/compliance/reports">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-green-700" aria-hidden="true" /> Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Readiness, expiring eligibility/authorizations, billing, findings, exposure and
                more — with permission-controlled CSV export.
              </CardContent>
            </Card>
          </Link>

          {/* Self-audit & findings workspace */}
          <Link href="/admin/compliance/audits">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4 text-green-700" aria-hidden="true" /> Self-audit & findings
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Run self-audits with reproducible sampling; track findings and corrective actions
                that cannot close without verification.
              </CardContent>
            </Card>
          </Link>

          {/* Two-factor authentication (self-service) */}
          <Link href="/admin/compliance/mfa">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-green-700" aria-hidden="true" /> Two-factor authentication
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Set up an authenticator app and recovery codes to protect your account. Required
                for privileged roles when enforcement is enabled.
              </CardContent>
            </Card>
          </Link>

          {/* Active sessions / devices */}
          <Link href="/admin/compliance/sessions">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-green-700" aria-hidden="true" /> Active sessions
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                See where you are signed in and revoke a device. Sessions carry idle and absolute
                timeouts and end automatically on a password or MFA change.
              </CardContent>
            </Card>
          </Link>

          {/* Security settings: break-glass + notifications */}
          <Link href="/admin/compliance/settings">
            <Card className="hover:border-green-500 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4 text-green-700" aria-hidden="true" /> Security settings
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Break-glass emergency access (audited and time-boxed) and your compliance
                notifications and escalations.
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Enforcement mode</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={flags.data?.gates ? "default" : "secondary"} className="gap-1">
              {flags.data?.gates ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />}
              Gates {flags.data?.gates ? "enforced" : "advisory"}
            </Badge>
            <Badge variant={flags.data?.mfa ? "default" : "secondary"} className="gap-1">
              {flags.data?.mfa ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />}
              MFA {flags.data?.mfa ? "required" : "optional"}
            </Badge>
            <Button asChild variant="outline" size="sm"><Link href="/admin/compliance/requirements">Manage requirements</Link></Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
