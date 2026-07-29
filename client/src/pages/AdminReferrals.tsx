import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Link2, Plus, Loader2, Copy, Trash2, Pencil, Users, BarChart3, UserCheck, Bell, Send, MessageSquare, CheckCheck,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function generateCode() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/* ─── Message Thread Dialog ─────────────────────────────────────────── */
function MessageThreadDialog({
  open,
  onClose,
  link,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  link: any;
  clients: any[];
}) {
  const utils = trpc.useUtils();
  const [newMsg, setNewMsg] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("none");

  const messagesQuery = trpc.admin.referrals.listMessages.useQuery(
    { referralLinkId: link?.id ?? 0 },
    { enabled: open && !!link?.id, refetchInterval: 10000 }
  );

  const sendMutation = trpc.admin.referrals.sendMessage.useMutation({
    onSuccess: () => {
      utils.admin.referrals.listMessages.invalidate({ referralLinkId: link.id });
      utils.admin.referrals.unreadCounts.invalidate();
      setNewMsg("");
      setSelectedClientId("none");
      toast.success("Message sent");
    },
    onError: (err) => toast.error(err.message),
  });

  const markReadMutation = trpc.admin.referrals.markRead.useMutation({
    onSuccess: () => {
      utils.admin.referrals.listMessages.invalidate({ referralLinkId: link.id });
      utils.admin.referrals.unreadCounts.invalidate();
    },
  });

  const messages = (messagesQuery.data ?? []) as any[];

  const handleSend = () => {
    if (!newMsg.trim()) return;
    const payload: any = { referralLinkId: link.id, message: newMsg.trim() };
    if (selectedClientId !== "none") payload.submissionId = parseInt(selectedClientId);
    sendMutation.mutate(payload);
  };

  const getClientName = (submissionId: number | null) => {
    if (!submissionId) return null;
    const c = clients.find((c: any) => c.id === submissionId);
    return c ? `${c.firstName} ${c.lastName}` : `Client #${submissionId}`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-600" />
            Messages — {link?.referrerName}
          </DialogTitle>
          <DialogDescription>
            Send action items or requests to this referrer. Tag a specific client to provide context.
          </DialogDescription>
        </DialogHeader>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2 min-h-[200px] max-h-[320px] pr-1">
          {messagesQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No messages yet. Send the first one below.</p>
            </div>
          ) : (
            messages.map((msg: any) => {
              const clientName = getClientName(msg.submissionId);
              const isUnread = !msg.readAt;
              return (
                <div key={msg.id} className={`rounded-lg p-3 border ${isUnread ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-800 flex-1">{msg.message}</p>
                    {isUnread && (
                      <button
                        onClick={() => markReadMutation.mutate({ messageId: msg.id })}
                        className="text-amber-500 hover:text-emerald-600 shrink-0"
                        title="Mark as read"
                      >
                        <CheckCheck className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {clientName && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                        Re: {clientName}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {new Date(msg.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    {isUnread && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Unread</span>}
                    {!isUnread && <span className="text-[10px] text-slate-400">Read</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Compose */}
        <div className="border-t border-slate-200 pt-3 space-y-2">
          <div>
            <Label className="text-xs text-slate-600">Tag a client (optional)</Label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue placeholder="No specific client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific client</SelectItem>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.firstName} {c.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Message</Label>
            <Textarea
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              placeholder={`e.g., @${link?.referrerName?.split(" ")[0] ?? "referrer"} please get me the DOB for client one`}
              className="min-h-[70px] text-sm mt-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
              }}
            />
            <p className="text-[10px] text-slate-400 mt-0.5">Ctrl+Enter to send</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
            onClick={handleSend}
            disabled={!newMsg.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function AdminReferrals() {
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedLink, setSelectedLink] = useState<any>(null);
  const [createForm, setCreateForm] = useState({ code: generateCode(), referrerName: "", description: "", email: "", password: "" });
  const [editForm, setEditForm] = useState({ referrerName: "", description: "", isActive: 1, email: "", password: "" });

  const linksQuery = trpc.admin.referrals.list.useQuery();
  const statsQuery = trpc.admin.referrals.stats.useQuery();
  const unreadCountsQuery = trpc.admin.referrals.unreadCounts.useQuery(undefined, { refetchInterval: 30000 });

  const createMutation = trpc.admin.referrals.create.useMutation({
    onSuccess: () => {
      utils.admin.referrals.list.invalidate();
      utils.admin.referrals.stats.invalidate();
      setShowCreate(false);
      setCreateForm({ code: generateCode(), referrerName: "", description: "", email: "", password: "" });
      toast.success("Referral link created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.admin.referrals.update.useMutation({
    onSuccess: () => {
      utils.admin.referrals.list.invalidate();
      setShowEdit(false);
      toast.success("Referral link updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.referrals.delete.useMutation({
    onSuccess: () => {
      utils.admin.referrals.list.invalidate();
      utils.admin.referrals.stats.invalidate();
      setShowDelete(false);
      setSelectedId(null);
      toast.success("Referral link deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const links = (linksQuery.data ?? []) as any[];
  const stats = statsQuery.data as any;
  const unreadCounts = (unreadCountsQuery.data ?? {}) as Record<number, number>;

  // Load clients for the selected referrer (for message tagging)
  const selectedLinkClients = trpc.admin.referrals.listMessages.useQuery(
    { referralLinkId: selectedLink?.id ?? 0 },
    { enabled: false } // we'll use a separate query below
  );

  const referrerClientsQuery = trpc.admin.referrerPortal.myClients.useQuery(
    { code: selectedLink?.code ?? "" },
    { enabled: showMessages && !!selectedLink?.code }
  );
  const referrerClients = (referrerClientsQuery.data ?? []) as any[];

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(url);
    toast.success("Referral link copied to clipboard");
  };

  const openEdit = (link: any) => {
    setSelectedId(link.id);
    setEditForm({ referrerName: link.referrerName, description: link.description || "", isActive: link.isActive, email: link.email || "", password: "" });
    setShowEdit(true);
  };

  const openMessages = (link: any) => {
    setSelectedLink(link);
    setShowMessages(true);
  };

  const copyPortalLink = () => {
    const url = `${window.location.origin}/referrer`;
    navigator.clipboard.writeText(url);
    toast.success("Referrer portal link copied");
  };

  const totalUnread = useMemo(() => Object.values(unreadCounts).reduce((s, n) => s + n, 0), [unreadCounts]);

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              Referral Links
              {totalUnread > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {totalUnread}
                </span>
              )}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Create and manage referral links to track who referred each client</p>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-9" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Create Link
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Link2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats?.totalLinks ?? 0}</p>
                <p className="text-xs text-slate-500">Total Links</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats?.totalReferrals ?? 0}</p>
                <p className="text-xs text-slate-500">Total Referrals</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {links.filter((l: any) => l.isActive).length}
                </p>
                <p className="text-xs text-slate-500">Active Links</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats?.totalMembers ?? 0}</p>
                <p className="text-xs text-slate-500">Total Members</p>
              </div>
            </div>
          </div>
        </div>

        {/* Links List */}
        {linksQuery.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : links.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <Link2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-700 mb-1">No referral links yet</h3>
            <p className="text-sm text-slate-500 mb-4">Create your first referral link to start tracking who refers new clients.</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Create First Link
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden admin-table-wrap">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Referrer</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Code</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Link</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Portal Login</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Referrals</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Created</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link: any) => {
                  const unread = unreadCounts[link.id] ?? 0;
                  return (
                    <tr key={link.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{link.referrerName}</p>
                          {link.description && <p className="text-xs text-slate-500 mt-0.5">{link.description}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-sm bg-slate-100 px-2 py-0.5 rounded text-slate-700">{link.code}</code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500 truncate max-w-[200px]">
                            {window.location.origin}/?ref={link.code}
                          </span>
                          <button onClick={() => copyLink(link.code)} className="text-blue-500 hover:text-blue-600" title="Copy link">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {link.email ? (
                          <span className="text-xs text-slate-600">{link.email}</span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No login</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-900">{link.usageCount}</span>
                          <span className="text-xs text-slate-400">signups</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] border-0 ${link.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {link.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(link.createdAt).toLocaleDateString("en-US")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {/* Message / Notification button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 w-7 p-0 relative ${unread > 0 ? "text-amber-500 hover:text-amber-600" : "text-slate-400 hover:text-slate-600"}`}
                            onClick={() => openMessages(link)}
                            title={unread > 0 ? `${unread} unread message(s)` : "Send message"}
                          >
                            <Bell className="h-3.5 w-3.5" />
                            {unread > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold">
                                {unread}
                              </span>
                            )}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600" onClick={() => openEdit(link)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500" onClick={() => { setSelectedId(link.id); setShowDelete(true); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* How it works */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">How Referral Links Work</h3>
          <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
            <li>Create a referral link with the referrer's name and optionally set up portal login credentials</li>
            <li>Share the generated link with the referrer — it looks like: <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">{window.location.origin}/?ref=abc123</code></li>
            <li>When someone signs up through that link, the referral is automatically tracked</li>
            <li>You can see which referrer brought each client on the client detail page under "Referred By"</li>
            <li>Use the <Bell className="h-3 w-3 inline" /> bell icon to send action items to a referrer (e.g., request missing info for a specific client)</li>
            <li>If you set up portal login, the referrer can sign in at <button onClick={copyPortalLink} className="underline text-blue-600 hover:text-blue-800">{window.location.origin}/referrer</button> to view their referred clients (read-only)</li>
          </ol>
        </div>
      </div>

      {/* Message Thread Dialog */}
      {selectedLink && (
        <MessageThreadDialog
          open={showMessages}
          onClose={() => { setShowMessages(false); setSelectedLink(null); }}
          link={selectedLink}
          clients={referrerClients}
        />
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Referral Link</DialogTitle>
            <DialogDescription>Create a unique link to track referrals from a specific person or organization</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Referrer Name *</Label>
              <Input placeholder="e.g., John Smith, Community Center" value={createForm.referrerName} onChange={(e) => setCreateForm({ ...createForm, referrerName: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Link Code</Label>
              <div className="flex gap-2">
                <Input value={createForm.code} onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} className="font-mono" />
                <Button variant="outline" size="sm" onClick={() => setCreateForm({ ...createForm, code: generateCode() })} className="shrink-0">Regenerate</Button>
              </div>
              <p className="text-xs text-slate-400 mt-1">This will be part of the URL: /?ref={createForm.code}</p>
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea placeholder="Notes about this referrer..." value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} className="min-h-[60px]" />
            </div>
            <div className="border-t border-slate-200 pt-3 mt-1">
              <p className="text-xs font-semibold text-slate-700 mb-2">Portal Login (optional)</p>
              <p className="text-xs text-slate-500 mb-2">Set up login credentials so this referrer can view their referred clients at /referrer</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" placeholder="referrer@email.com" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Password (min 6 characters)</Label>
                  <Input type="password" placeholder="Set a password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
              if (!createForm.referrerName.trim()) { toast.error("Referrer name is required"); return; }
              if (!createForm.code.trim()) { toast.error("Link code is required"); return; }
              if (createForm.email && !createForm.password) { toast.error("Password is required when email is set"); return; }
              if (createForm.password && createForm.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
              const payload: any = { code: createForm.code, referrerName: createForm.referrerName, description: createForm.description };
              if (createForm.email) payload.email = createForm.email;
              if (createForm.password) payload.password = createForm.password;
              createMutation.mutate(payload);
            }} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Referral Link</DialogTitle>
            <DialogDescription>Update the referrer information or deactivate the link</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Referrer Name</Label>
              <Input value={editForm.referrerName} onChange={(e) => setEditForm({ ...editForm, referrerName: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="min-h-[60px]" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={editForm.isActive === 1} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked ? 1 : 0 })} className="rounded" />
              <Label htmlFor="isActive" className="text-sm">Active (accepting new referrals)</Label>
            </div>
            <div className="border-t border-slate-200 pt-3 mt-1">
              <p className="text-xs font-semibold text-slate-700 mb-2">Portal Login</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" placeholder="referrer@email.com" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">New Password (leave blank to keep current)</Label>
                  <Input type="password" placeholder="Set new password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
              if (selectedId) {
                const payload: any = { id: selectedId, referrerName: editForm.referrerName, description: editForm.description, isActive: editForm.isActive };
                if (editForm.email) payload.email = editForm.email;
                if (editForm.password && editForm.password.length >= 6) payload.password = editForm.password;
                updateMutation.mutate(payload);
              }
            }} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Referral Link</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this referral link? Existing referral attributions on clients will be preserved, but no new referrals can be tracked.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (selectedId) deleteMutation.mutate({ id: selectedId }); }}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
