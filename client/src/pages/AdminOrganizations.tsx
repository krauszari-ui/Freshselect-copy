import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Plus, Users, Pencil, UserPlus, UserMinus } from "lucide-react";

export default function AdminOrganizations() {
  const utils = trpc.useUtils();

  // ── Org list ────────────────────────────────────────────────────────────────
  const { data: orgs = [], isLoading } = trpc.org.list.useQuery({ includeInactive: true });

  // ── Staff list (for member assignment) ──────────────────────────────────────
  const { data: allStaff = [] } = trpc.admin.staffList.useQuery();

  // ── Create org ──────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", contactEmail: "", contactPhone: "", notes: "" });
  const createOrg = trpc.org.create.useMutation({
    onSuccess: () => {
      utils.org.list.invalidate();
      setShowCreate(false);
      setCreateForm({ name: "", contactEmail: "", contactPhone: "", notes: "" });
      toast.success("Organization created");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Edit org ─────────────────────────────────────────────────────────────────
  const [editOrg, setEditOrg] = useState<null | { id: number; name: string; contactEmail?: string | null; contactPhone?: string | null; notes?: string | null; isActive: number }>(null);
  const updateOrg = trpc.org.update.useMutation({
    onSuccess: () => {
      utils.org.list.invalidate();
      setEditOrg(null);
      toast.success("Organization updated");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Manage members ───────────────────────────────────────────────────────────
  const [manageOrg, setManageOrg] = useState<null | { id: number; name: string }>(null);
  const { data: orgDetail } = trpc.org.get.useQuery(
    { id: manageOrg?.id ?? 0 },
    { enabled: !!manageOrg }
  );
  const assignUser = trpc.org.assignUser.useMutation({
    onSuccess: () => {
      utils.org.get.invalidate({ id: manageOrg?.id });
      utils.org.list.invalidate();
      toast.success("Member updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const [addMemberId, setAddMemberId] = useState<string>("");

  const unassignedStaff = allStaff.filter(
    (s: any) => !s.orgId && s.role !== "admin" && s.role !== "super_admin"
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Organizations</h1>
              <p className="text-sm text-muted-foreground">Manage partner organizations and their staff access</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Organization
          </Button>
        </div>

        {/* Orgs table */}
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && orgs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No organizations yet. Create one to get started.</TableCell></TableRow>
              )}
              {orgs.map((org: any) => {
                const memberCount = allStaff.filter((s: any) => s.orgId === org.id).length;
                return (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="font-medium">{org.name}</div>
                      {org.notes && <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">{org.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{org.contactEmail ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{org.contactPhone ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">{memberCount}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.isActive ? "default" : "secondary"}>
                        {org.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setManageOrg({ id: org.id, name: org.name })}>
                          <Users className="w-3.5 h-3.5 mr-1" /> Members
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditOrg(org)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create org dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Organization</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Lahoyal" />
            </div>
            <div>
              <label className="text-sm font-medium">Contact Email</label>
              <Input value={createForm.contactEmail} onChange={(e) => setCreateForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="contact@org.com" />
            </div>
            <div>
              <label className="text-sm font-medium">Contact Phone</label>
              <Input value={createForm.contactPhone} onChange={(e) => setCreateForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder="(555) 000-0000" />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea value={createForm.notes} onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Internal notes about this organization…" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={!createForm.name.trim() || createOrg.isPending} onClick={() => createOrg.mutate(createForm)}>
              {createOrg.isPending ? "Creating…" : "Create Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit org dialog */}
      {editOrg && (
        <Dialog open onOpenChange={() => setEditOrg(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Organization</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <Input value={editOrg.name} onChange={(e) => setEditOrg((o) => o ? { ...o, name: e.target.value } : o)} />
              </div>
              <div>
                <label className="text-sm font-medium">Contact Email</label>
                <Input value={editOrg.contactEmail ?? ""} onChange={(e) => setEditOrg((o) => o ? { ...o, contactEmail: e.target.value } : o)} />
              </div>
              <div>
                <label className="text-sm font-medium">Contact Phone</label>
                <Input value={editOrg.contactPhone ?? ""} onChange={(e) => setEditOrg((o) => o ? { ...o, contactPhone: e.target.value } : o)} />
              </div>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <Textarea value={editOrg.notes ?? ""} onChange={(e) => setEditOrg((o) => o ? { ...o, notes: e.target.value } : o)} rows={3} />
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={String(editOrg.isActive)} onValueChange={(v) => setEditOrg((o) => o ? { ...o, isActive: Number(v) } : o)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Active</SelectItem>
                    <SelectItem value="0">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOrg(null)}>Cancel</Button>
              <Button disabled={updateOrg.isPending} onClick={() => updateOrg.mutate({ id: editOrg.id, name: editOrg.name, contactEmail: editOrg.contactEmail, contactPhone: editOrg.contactPhone, notes: editOrg.notes, isActive: editOrg.isActive })}>
                {updateOrg.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Manage members dialog */}
      {manageOrg && (
        <Dialog open onOpenChange={() => { setManageOrg(null); setAddMemberId(""); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Members — {manageOrg.name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {/* Current members */}
              <div>
                <p className="text-sm font-medium mb-2">Current Members</p>
                {!orgDetail?.members?.length && <p className="text-sm text-muted-foreground">No members yet.</p>}
                <div className="space-y-1.5">
                  {orgDetail?.members?.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <span className="text-sm font-medium">{m.name ?? m.email}</span>
                        <Badge variant="outline" className="ml-2 text-xs">{m.role}</Badge>
                      </div>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => assignUser.mutate({ userId: m.id, orgId: null })}>
                        <UserMinus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add member */}
              <div>
                <p className="text-sm font-medium mb-2">Add Member</p>
                <div className="flex gap-2">
                  <Select value={addMemberId} onValueChange={setAddMemberId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a staff member…" />
                    </SelectTrigger>
                    <SelectContent>
                      {unassignedStaff.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name ?? s.email} ({s.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button disabled={!addMemberId || assignUser.isPending}
                    onClick={() => { assignUser.mutate({ userId: Number(addMemberId), orgId: manageOrg.id }); setAddMemberId(""); }}>
                    <UserPlus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManageOrg(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
