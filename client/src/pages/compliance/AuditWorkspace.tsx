import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, Loader2, ShieldAlert, CheckCircle2, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Self-audit & CAPA workspace. Create audits, open findings, and drive the CAPA
 * workflow. A finding cannot be closed until the server-side gate is satisfied
 * (corrective action complete + verification evidence + passed follow-up test +
 * a separate compliance approver) — the UI simply surfaces the outcome.
 */
export default function AuditWorkspace() {
  const utils = trpc.useUtils();
  const audits = trpc.compliance.audits.list.useQuery();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("billing_accuracy");
  const [selected, setSelected] = useState<number | null>(null);

  const create = trpc.compliance.audits.create.useMutation({
    onSuccess: () => { setTitle(""); utils.compliance.audits.list.invalidate(); toast.success("Audit created"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Search className="h-6 w-6 text-green-700" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-slate-900">Self-Audit & Findings</h1>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">New audit</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div><Label htmlFor="at" className="text-xs">Title</Label><Input id="at" className="h-8 w-56" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><Label htmlFor="ay" className="text-xs">Type</Label><Input id="ay" className="h-8 w-48" value={type} onChange={(e) => setType(e.target.value)} /></div>
            <Button size="sm" className="gap-1" disabled={create.isPending || !title} onClick={() => create.mutate({ title, auditType: type })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Create
            </Button>
          </CardContent>
        </Card>

        <QueryStates q={audits} empty="No audits yet.">
          <div className="space-y-2">
            {(audits.data ?? []).map((a) => (
              <Card key={a.id}>
                <CardHeader className="pb-2 cursor-pointer" onClick={() => setSelected(selected === a.id ? null : a.id)}>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{a.title} <Badge variant="secondary" className="ml-2">{a.auditType}</Badge></span>
                    <Badge variant={a.status === "closed" ? "default" : "outline"}>{a.status}</Badge>
                  </CardTitle>
                </CardHeader>
                {selected === a.id && <CardContent className="space-y-3"><GeneratePackageButton auditId={a.id} /><AuditFindings auditId={a.id} /></CardContent>}
              </Card>
            ))}
          </div>
        </QueryStates>
      </div>
    </AdminLayout>
  );
}

function GeneratePackageButton({ auditId }: { auditId: number }) {
  const gen = trpc.compliance.audits.generatePackage.useMutation({
    onSuccess: (pkg) => {
      const bytes = Uint8Array.from(atob(pkg.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = pkg.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Audit package generated (${pkg.manifest.counts.findings} finding(s))`);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
      <span className="text-xs text-slate-600">Generate a professional PDF package (cover, scope, sampling, findings, financial analysis, certification, checksummed manifest).</span>
      <Button size="sm" variant="outline" className="gap-1 shrink-0" disabled={gen.isPending} onClick={() => gen.mutate({ auditId })}>
        {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />} Audit package
      </Button>
    </div>
  );
}

function AuditFindings({ auditId }: { auditId: number }) {
  const utils = trpc.useUtils();
  const list = trpc.compliance.audits.listFindings.useQuery({ auditId });
  const [condition, setCondition] = useState("");
  const create = trpc.compliance.audits.createFinding.useMutation({
    onSuccess: () => { setCondition(""); utils.compliance.audits.listFindings.invalidate({ auditId }); toast.success("Finding created"); },
    onError: (e) => toast.error(e.message),
  });
  const close = trpc.compliance.audits.closeFinding.useMutation({
    onSuccess: () => { utils.compliance.audits.listFindings.invalidate({ auditId }); toast.success("Finding closed"); },
    onError: (e) => toast.error(e.message.replace(/^.*FINDING_CANNOT_CLOSE:/, "Cannot close — unmet: ")),
  });
  const addCA = trpc.compliance.audits.addCorrectiveAction.useMutation({ onSuccess: () => toast.success("Corrective action added (complete)"), onError: (e) => toast.error(e.message) });
  const addFU = trpc.compliance.audits.addFollowUpTest.useMutation({ onSuccess: () => toast.success("Follow-up test recorded"), onError: (e) => toast.error(e.message) });

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1"><Label htmlFor="fc" className="text-xs">Condition found</Label><Input id="fc" className="h-8" value={condition} onChange={(e) => setCondition(e.target.value)} /></div>
        <Button size="sm" className="gap-1" disabled={create.isPending || !condition} onClick={() => create.mutate({ auditId, conditionFound: condition, risk: "medium" })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Finding
        </Button>
      </div>
      <QueryStates q={list} empty="No findings.">
        <ul className="divide-y text-sm">
          {(list.data ?? []).map((f) => (
            <li key={f.id} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <ShieldAlert className="inline h-3.5 w-3.5 text-amber-600 mr-1" aria-hidden="true" />
                  <span className="text-slate-700">{f.conditionFound ?? `Finding #${f.id}`}</span>
                  <Badge variant="outline" className="ml-2">{f.state.replace(/_/g, " ")}</Badge>
                  <Badge variant="secondary" className="ml-1">{f.risk}</Badge>
                </span>
                {f.state !== "closed" ? (
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="ghost" disabled={addCA.isPending} onClick={() => addCA.mutate({ findingId: f.id, correctiveAction: "Corrective action", completed: true })}>+CA</Button>
                    <Button size="sm" variant="ghost" disabled={addFU.isPending} onClick={() => addFU.mutate({ findingId: f.id, result: "pass" })}>+Follow-up</Button>
                    <Button size="sm" variant="outline" disabled={close.isPending} onClick={() => close.mutate({ findingId: f.id })}>Close</Button>
                  </span>
                ) : <CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" />}
              </div>
            </li>
          ))}
        </ul>
      </QueryStates>
      <p className="text-xs text-slate-500">A finding closes only when a corrective action is complete, verification evidence is attached, a follow-up test passes, and a different compliance user approves. Attach corrective-action evidence via the document workflow to satisfy the verification gate.</p>
    </div>
  );
}

function QueryStates({ q, empty, children }: { q: { isLoading: boolean; isError: boolean; data?: unknown }; empty: string; children: React.ReactNode }) {
  if (q.isLoading) return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>;
  if (q.isError) return <p className="text-sm text-slate-500">Unable to load (database unavailable).</p>;
  if (Array.isArray(q.data) && q.data.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return <>{children}</>;
}
