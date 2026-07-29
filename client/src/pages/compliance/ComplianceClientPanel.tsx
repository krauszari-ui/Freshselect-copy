import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReadinessBadge } from "./readinessBadge";
import { maskIdentifier } from "@shared/compliance/constants";
import { ArrowLeft, Loader2, RefreshCw, Plus, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Per-client compliance record: a readiness banner (derived, not hand-set) plus
 * tabs for Eligibility, Referrals, Authorizations, and Requirements. Reuses the
 * existing design system. Renders within the admin layout.
 */
export default function ComplianceClientPanel() {
  const params = useParams<{ id: string }>();
  const submissionId = Number(params.id);
  const utils = trpc.useUtils();

  const readiness = trpc.compliance.readiness.get.useQuery({ submissionId }, { enabled: Number.isFinite(submissionId) });
  const recompute = trpc.compliance.readiness.recompute.useMutation({
    onSuccess: () => { utils.compliance.readiness.get.invalidate({ submissionId }); toast.success("Readiness recalculated"); },
    onError: (e) => toast.error(e.message),
  });

  if (!Number.isFinite(submissionId)) {
    return <AdminLayout><div className="p-6 text-slate-600">Invalid client id.</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <Link href={`/admin/clients/${submissionId}`}>
          <Button variant="ghost" size="sm" className="gap-1 -ml-2"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to client</Button>
        </Link>

        {/* ─── Readiness banner ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">Compliance readiness:</span>
              {readiness.data ? <ReadinessBadge status={readiness.data.status} /> : <Badge variant="secondary">Not computed</Badge>}
            </div>
            <Button variant="outline" size="sm" className="gap-1" disabled={recompute.isPending} onClick={() => recompute.mutate({ submissionId })}>
              {recompute.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Recalculate
            </Button>
          </CardContent>
          {Array.isArray(readiness.data?.blockingReasons) && (readiness.data.blockingReasons as string[]).length > 0 && (
            <CardContent className="pt-0">
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900"><ShieldAlert className="h-4 w-4" aria-hidden="true" /> Blocking reasons</p>
                <ul className="mt-1 list-disc pl-6 text-sm text-amber-900">
                  {(readiness.data.blockingReasons as string[]).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            </CardContent>
          )}
        </Card>

        <Tabs defaultValue="eligibility">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
            <TabsTrigger value="authorizations">Authorizations</TabsTrigger>
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
          </TabsList>

          <TabsContent value="eligibility"><EligibilityTab submissionId={submissionId} /></TabsContent>
          <TabsContent value="referrals"><ReferralsTab submissionId={submissionId} /></TabsContent>
          <TabsContent value="authorizations"><AuthorizationsTab submissionId={submissionId} /></TabsContent>
          <TabsContent value="requirements"><RequirementsTab submissionId={submissionId} /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function SectionShell({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EligibilityTab({ submissionId }: { submissionId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.compliance.eligibility.list.useQuery({ submissionId });
  const [cin, setCin] = useState("");
  const create = trpc.compliance.eligibility.create.useMutation({
    onSuccess: () => { setCin(""); utils.compliance.eligibility.list.invalidate({ submissionId }); toast.success("Eligibility recorded"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <SectionShell
      title="Eligibility verifications (append-only)"
      action={
        <div className="flex items-end gap-2">
          <div><Label htmlFor="cin" className="text-xs">CIN / Medicaid ID</Label><Input id="cin" className="h-8 w-40" value={cin} onChange={(e) => setCin(e.target.value)} /></div>
          <Button size="sm" className="gap-1" disabled={create.isPending} onClick={() => create.mutate({ submissionId, cin: cin || undefined, medicaidStatus: "active", status: "verified" })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Verify
          </Button>
        </div>
      }
    >
      <QueryStates q={list} empty="No eligibility verifications yet.">
        <ul className="divide-y text-sm">
          {(list.data ?? []).map((e) => (
            <li key={e.id} className="py-2 flex items-center justify-between">
              <span>
                <Badge variant={e.status === "verified" ? "default" : "secondary"}>{e.status}</Badge>
                <span className="ml-2 text-slate-600">Medicaid: {e.medicaidStatus}{e.mco ? ` · MCO: ${e.mco}` : ""}</span>
                {e.cinNormalized && <span className="ml-2 text-slate-500">CIN {maskIdentifier(e.cinNormalized)}</span>}
              </span>
              <span className="text-slate-400">{new Date(e.createdAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      </QueryStates>
    </SectionShell>
  );
}

function ReferralsTab({ submissionId }: { submissionId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.compliance.referrals.list.useQuery({ submissionId });
  const [entity, setEntity] = useState("");
  const create = trpc.compliance.referrals.create.useMutation({
    onSuccess: () => { setEntity(""); utils.compliance.referrals.list.invalidate({ submissionId }); toast.success("Referral recorded"); },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = trpc.compliance.referrals.setStatus.useMutation({
    onSuccess: () => utils.compliance.referrals.list.invalidate({ submissionId }),
    onError: (e) => toast.error(e.message),
  });
  return (
    <SectionShell
      title="SCN referrals"
      action={
        <div className="flex items-end gap-2">
          <div><Label htmlFor="ent" className="text-xs">Referring entity</Label><Input id="ent" className="h-8 w-48" value={entity} onChange={(e) => setEntity(e.target.value)} /></div>
          <Button size="sm" className="gap-1" disabled={create.isPending || !entity} onClick={() => create.mutate({ submissionId, referringEntity: entity, referralStatus: "received" })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add
          </Button>
        </div>
      }
    >
      <QueryStates q={list} empty="No referrals yet.">
        <ul className="divide-y text-sm">
          {(list.data ?? []).map((r) => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-2">
              <span><Badge variant="outline">{r.referralStatus}</Badge> <span className="ml-2 text-slate-700">{r.referringEntity ?? "—"}</span></span>
              {r.referralStatus !== "accepted" && (
                <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ referralId: r.id, submissionId, status: "accepted" })}>Accept</Button>
              )}
            </li>
          ))}
        </ul>
      </QueryStates>
    </SectionShell>
  );
}

function AuthorizationsTab({ submissionId }: { submissionId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.compliance.authorizations.list.useQuery({ submissionId });
  const [units, setUnits] = useState("30");
  const create = trpc.compliance.authorizations.create.useMutation({
    onSuccess: () => { utils.compliance.authorizations.list.invalidate({ submissionId }); toast.success("Authorization created"); },
    onError: (e) => toast.error(e.message),
  });
  const consume = trpc.compliance.authorizations.consume.useMutation({
    onSuccess: (r) => { utils.compliance.authorizations.list.invalidate({ submissionId }); toast.success(r.ok ? `Consumed — ${r.remaining} left` : "Consumption rejected"); },
    onError: (e) => toast.error(e.message.replace(/^.*UNIT_CONSUMPTION_FAILED:/, "Cannot consume: ")),
  });
  return (
    <SectionShell
      title="Service authorizations"
      action={
        <div className="flex items-end gap-2">
          <div><Label htmlFor="au" className="text-xs">Units</Label><Input id="au" type="number" className="h-8 w-24" value={units} onChange={(e) => setUnits(e.target.value)} /></div>
          <Button size="sm" className="gap-1" disabled={create.isPending} onClick={() => create.mutate({ submissionId, authorizedUnits: Number(units) || 0, unitType: "meal", status: "active" })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Create (active)
          </Button>
        </div>
      }
    >
      <QueryStates q={list} empty="No authorizations yet.">
        <ul className="divide-y text-sm">
          {(list.data ?? []).map((a) => (
            <li key={a.id} className="py-2 flex items-center justify-between gap-2">
              <span>
                <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
                <span className="ml-2 text-slate-700">{a.remainingUnits}/{a.authorizedUnits} {a.unitType}(s) remaining</span>
                {a.rate && <span className="ml-2 text-slate-500">@ ${a.rate}</span>}
              </span>
              {a.status === "active" && a.remainingUnits > 0 && (
                <Button size="sm" variant="outline" disabled={consume.isPending} onClick={() => consume.mutate({ authorizationId: a.id, submissionId, units: 1 })}>Consume 1</Button>
              )}
            </li>
          ))}
        </ul>
      </QueryStates>
    </SectionShell>
  );
}

function RequirementsTab({ submissionId }: { submissionId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.compliance.requirements.listAssignments.useQuery({ submissionId });
  const assign = trpc.compliance.requirements.assign.useMutation({
    onSuccess: (r) => { utils.compliance.requirements.listAssignments.invalidate({ submissionId }); toast.success(`Assigned ${r.assigned} requirement(s)`); },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = trpc.compliance.requirements.setAssignmentStatus.useMutation({
    onSuccess: () => utils.compliance.requirements.listAssignments.invalidate({ submissionId }),
    onError: (e) => toast.error(e.message),
  });
  return (
    <SectionShell
      title="Requirement assignments"
      action={
        <Button size="sm" className="gap-1" disabled={assign.isPending} onClick={() => assign.mutate({ submissionId, serviceDate: new Date() })}>
          {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />} Assign applicable
        </Button>
      }
    >
      <QueryStates q={list} empty="No requirements assigned. Use “Assign applicable”.">
        <ul className="divide-y text-sm">
          {(list.data ?? []).map((a) => (
            <li key={a.id} className="py-2 flex items-center justify-between gap-2">
              <span>
                {a.blockingVersion && <ShieldAlert className="inline h-3.5 w-3.5 text-amber-600 mr-1" aria-hidden="true" />}
                <span className="text-slate-700">{a.title ?? `Requirement #${a.requirementVersionId}`}</span>
                <Badge variant={a.status === "satisfied" ? "default" : "secondary"} className="ml-2">{a.status}</Badge>
              </span>
              {a.status !== "satisfied" && (
                <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ assignmentId: a.id, submissionId, status: "satisfied" })}>Mark satisfied</Button>
              )}
            </li>
          ))}
        </ul>
      </QueryStates>
    </SectionShell>
  );
}

/** Small helper for loading/error/empty states around a query. */
function QueryStates({ q, empty, children }: { q: { isLoading: boolean; isError: boolean; data?: unknown }; empty: string; children: React.ReactNode }) {
  if (q.isLoading) return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>;
  if (q.isError) return <p className="text-sm text-slate-500">Unable to load (database unavailable).</p>;
  if (Array.isArray(q.data) && q.data.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return <>{children}</>;
}
