import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { BookOpen, Plus, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Requirements library — versioned, config-driven requirements. Legal/program
 * conclusions live here as data (source, section, effective dates, blocking),
 * not hard-coded in components.
 */
export default function RequirementsLibrary() {
  const utils = trpc.useUtils();
  const list = trpc.compliance.requirements.listDefinitions.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ key: "", title: "", plainDescription: "", sourceOrganization: "", sourceDocument: "", effectiveDate: "", blocking: true });

  const create = trpc.compliance.requirements.createDefinition.useMutation({
    onSuccess: () => { toast.success("Requirement version created"); setOpen(false); utils.compliance.requirements.listDefinitions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-green-700" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-slate-900">Requirements Library</h1>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1"><Plus className="h-4 w-4" aria-hidden="true" /> New requirement</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New requirement version</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label htmlFor="rk">Key</Label><Input id="rk" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="e.g. scn_referral_present" /></div>
                <div><Label htmlFor="rt">Title</Label><Input id="rt" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label htmlFor="rd">Plain-language description</Label><Textarea id="rd" value={form.plainDescription} onChange={(e) => setForm({ ...form, plainDescription: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label htmlFor="ro">Source organization</Label><Input id="ro" value={form.sourceOrganization} onChange={(e) => setForm({ ...form, sourceOrganization: e.target.value })} placeholder="NYSDOH / OMIG / CMS" /></div>
                  <div><Label htmlFor="rf">Source document</Label><Input id="rf" value={form.sourceDocument} onChange={(e) => setForm({ ...form, sourceDocument: e.target.value })} /></div>
                </div>
                <div><Label htmlFor="re">Effective date</Label><Input id="re" type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.blocking} onChange={(e) => setForm({ ...form, blocking: e.target.checked })} />
                  Blocking (gates service readiness / invoicing)
                </label>
              </div>
              <DialogFooter>
                <Button
                  disabled={create.isPending || !form.key || !form.title}
                  onClick={() => create.mutate({
                    key: form.key.trim(), title: form.title.trim(),
                    plainDescription: form.plainDescription || undefined,
                    sourceOrganization: form.sourceOrganization || undefined,
                    sourceDocument: form.sourceDocument || undefined,
                    effectiveDate: form.effectiveDate ? new Date(form.effectiveDate) : undefined,
                    blocking: form.blocking,
                  })}
                >
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden="true" />} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <p className="text-sm text-slate-600">
          Requirements are evaluated using the version in effect on the applicable service date. A newer
          version is never applied retroactively without a recorded legal basis and approval.
        </p>

        {list.isLoading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>}
        {list.isError && <p className="text-sm text-slate-500">Unable to load requirements (database unavailable).</p>}

        <div className="space-y-3">
          {(list.data ?? []).map(({ definition, versions }) => (
            <Card key={definition.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <code className="text-sm text-slate-700">{definition.key}</code>
                  {definition.category && <Badge variant="secondary">{definition.category}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-start justify-between border-t pt-2 first:border-t-0 first:pt-0 text-sm">
                    <div>
                      <div className="font-medium text-slate-800">{v.title} <span className="text-slate-400">v{v.version}</span></div>
                      <div className="text-slate-500">
                        {v.sourceOrganization ?? "—"}{v.sourceDocument ? ` · ${v.sourceDocument}` : ""}
                        {v.effectiveDate ? ` · effective ${new Date(v.effectiveDate).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="gap-1">
                        {v.blocking ? <ShieldAlert className="h-3 w-3" aria-hidden="true" /> : <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
                        {v.blocking ? "Blocking" : "Advisory"}
                      </Badge>
                      <Badge variant={v.approvalStatus === "approved" ? "default" : "secondary"}>{v.approvalStatus}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          {list.data && list.data.length === 0 && <p className="text-sm text-slate-500">No requirements defined yet.</p>}
        </div>
      </div>
    </AdminLayout>
  );
}
