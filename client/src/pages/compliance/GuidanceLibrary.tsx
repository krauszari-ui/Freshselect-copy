import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookMarked, Plus, Loader2, Lock, HelpCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Guidance & clarification library. Privileged (attorney-client / work-product)
 * records are filtered server-side; the badge here is only a redundant cue.
 */
export default function GuidanceLibrary() {
  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <BookMarked className="h-6 w-6 text-green-700" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-slate-900">Guidance & Clarifications</h1>
        </div>
        <p className="text-sm text-slate-600">
          Source guidance (CMS, NYSDOH/OHIP, OMIG, SCNs, MCOs, contracts, attorneys) and the
          workflow for clarifying unclear requirements. Attorney-client privileged records are
          restricted to authorized users.
        </p>
        <Tabs defaultValue="guidance">
          <TabsList>
            <TabsTrigger value="guidance">Guidance</TabsTrigger>
            <TabsTrigger value="clarifications">Clarifications</TabsTrigger>
          </TabsList>
          <TabsContent value="guidance"><GuidanceTab /></TabsContent>
          <TabsContent value="clarifications"><ClarificationsTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function GuidanceTab() {
  const utils = trpc.useUtils();
  const list = trpc.compliance.guidance.list.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", sourceOrganization: "", sourceType: "nysdoh_ohip", summary: "", privileged: false });
  const create = trpc.compliance.guidance.create.useMutation({
    onSuccess: () => { setOpen(false); setForm({ title: "", sourceOrganization: "", sourceType: "nysdoh_ohip", summary: "", privileged: false }); utils.compliance.guidance.list.invalidate(); toast.success("Guidance added"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mt-4 space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-4 w-4" aria-hidden="true" /> Add guidance</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add guidance document</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label htmlFor="gt">Title</Label><Input id="gt" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label htmlFor="go">Source organization</Label><Input id="go" value={form.sourceOrganization} onChange={(e) => setForm({ ...form, sourceOrganization: e.target.value })} placeholder="NYSDOH / OMIG / CMS / MCO" /></div>
              <div><Label htmlFor="gs">Summary</Label><Textarea id="gs" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.privileged} onChange={(e) => setForm({ ...form, privileged: e.target.checked })} /> Attorney-client privileged / work product</label>
            </div>
            <DialogFooter>
              <Button disabled={create.isPending || !form.title} onClick={() => create.mutate({ title: form.title.trim(), sourceOrganization: form.sourceOrganization || undefined, sourceType: form.sourceType as "nysdoh_ohip", summary: form.summary || undefined, privileged: form.privileged })}>
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden="true" />} Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <QueryStates q={list} empty="No guidance documents yet.">
        {(list.data ?? []).map((d) => (
          <Card key={d.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {d.title}
                <Badge variant="secondary">{d.sourceType}</Badge>
                {d.privileged && <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300"><Lock className="h-3 w-3" aria-hidden="true" /> Privileged</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              {d.sourceOrganization ?? "—"}{d.versions[0]?.summary ? ` · ${d.versions[0].summary}` : ""}
            </CardContent>
          </Card>
        ))}
      </QueryStates>
    </div>
  );
}

function ClarificationsTab() {
  const utils = trpc.useUtils();
  const list = trpc.compliance.guidance.clarifications.list.useQuery();
  const [q, setQ] = useState("");
  const create = trpc.compliance.guidance.clarifications.create.useMutation({
    onSuccess: () => { setQ(""); utils.compliance.guidance.clarifications.list.invalidate(); toast.success("Clarification submitted"); },
    onError: (e) => toast.error(e.message),
  });
  const advance = trpc.compliance.guidance.clarifications.advance.useMutation({
    onSuccess: () => utils.compliance.guidance.clarifications.list.invalidate(),
    onError: (e) => toast.error(e.message.replace(/^.*CLARIFICATION_TRANSITION_DENIED:/, "Cannot advance: ")),
  });
  const NEXT: Record<string, string> = { submitted: "facts_recorded", facts_recorded: "sent_to_agency", sent_to_agency: "answered", answered: "interpreted", interpreted: "closed" };
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1"><Label htmlFor="cq" className="text-xs">Precise question</Label><Input id="cq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Is X required for population Y under SCN Z?" /></div>
        <Button size="sm" className="gap-1" disabled={create.isPending || q.length < 5} onClick={() => create.mutate({ question: q })}><HelpCircle className="h-4 w-4" aria-hidden="true" /> Submit</Button>
      </div>
      <QueryStates q={list} empty="No clarification requests yet.">
        <ul className="divide-y text-sm">
          {(list.data ?? []).map((c) => (
            <li key={c.id} className="py-2 flex items-center justify-between gap-2">
              <span>
                <Badge variant="outline">{c.status.replace(/_/g, " ")}</Badge>
                <span className="ml-2 text-slate-700">{c.question}</span>
              </span>
              {NEXT[c.status] && (
                <Button size="sm" variant="outline" disabled={advance.isPending} onClick={() => advance.mutate({ id: c.id, to: NEXT[c.status] as "facts_recorded" })}>
                  → {NEXT[c.status].replace(/_/g, " ")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </QueryStates>
    </div>
  );
}

function QueryStates({ q, empty, children }: { q: { isLoading: boolean; isError: boolean; data?: unknown }; empty: string; children: React.ReactNode }) {
  if (q.isLoading) return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>;
  if (q.isError) return <p className="text-sm text-slate-500">Unable to load (database unavailable or not permitted).</p>;
  if (Array.isArray(q.data) && q.data.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return <>{children}</>;
}
