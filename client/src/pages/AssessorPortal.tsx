import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2, CheckCircle2, XCircle, Search, LogOut, ClipboardList,
  Clock, FolderCheck, AlertCircle, Ban, Users, TrendingUp, BarChart3,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type Tab = "pending" | "recorded" | "missing_information" | "not_eligible";

const TAB_CONFIG: Record<Tab, { label: string; icon: React.ReactNode; emptyTitle: string; emptyDesc: string; badgeClass: string; color: string }> = {
  pending: {
    label: "Pending Assessment",
    icon: <Clock className="h-4 w-4" />,
    emptyTitle: "No clients pending assessment",
    emptyDesc: "All your assigned clients have been reviewed.",
    badgeClass: "bg-amber-100 text-amber-700",
    color: "amber",
  },
  recorded: {
    label: "Assessment Recorded",
    icon: <FolderCheck className="h-4 w-4" />,
    emptyTitle: "No recorded assessments yet",
    emptyDesc: "Clients will appear here once their stage is set to Assessment Recorded.",
    badgeClass: "bg-sky-100 text-sky-700",
    color: "sky",
  },
  missing_information: {
    label: "Missing Information",
    icon: <AlertCircle className="h-4 w-4" />,
    emptyTitle: "No clients flagged for missing information",
    emptyDesc: "Clients you flag for missing information will appear here.",
    badgeClass: "bg-orange-100 text-orange-700",
    color: "orange",
  },
  not_eligible: {
    label: "Not Eligible",
    icon: <Ban className="h-4 w-4" />,
    emptyTitle: "No clients marked not eligible",
    emptyDesc: "Clients you mark as not eligible will appear here.",
    badgeClass: "bg-rose-100 text-rose-700",
    color: "rose",
  },
};

export default function AssessorPortal() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced value used for API calls
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [newApplicantFilter, setNewApplicantFilter] = useState<string>("all");

  // Approve state
  const [confirmApproveId, setConfirmApproveId] = useState<number | null>(null);
  const [confirmApproveName, setConfirmApproveName] = useState("");

  // Reject state
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectName, setRejectName] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  // Missing info state
  const [missingId, setMissingId] = useState<number | null>(null);
  const [missingName, setMissingName] = useState("");
  const [missingNote, setMissingNote] = useState("");

  // Not eligible state
  const [notEligibleId, setNotEligibleId] = useState<number | null>(null);
  const [notEligibleName, setNotEligibleName] = useState("");
  const [notEligibleReason, setNotEligibleReason] = useState("");

  const utils = trpc.useUtils();

  // Org staff (assessors with orgId) must use the /org portal, not /assessor
  useEffect(() => {
    if (!loading && user && (user as any).orgId) {
      window.location.replace("/org");
    }
  }, [user, loading]);

  // Debounce search input — wait 400ms after typing stops before firing API call
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Scoped stats for this assessor
  const { data: stats } = trpc.admin.assessorStats.useQuery(undefined, { enabled: !!user });

  const { data: clients, isLoading } = trpc.admin.assessorList.useQuery(
    {
      search: search || undefined,
      tab: activeTab,
      priority: priorityFilter !== "all" ? (priorityFilter as any) : undefined,
      newApplicant: newApplicantFilter !== "all" ? (newApplicantFilter as "new" | "transfer") : undefined,
    },
    { enabled: !!user }
  );

  const counts: Record<Tab, number> = {
    pending: stats?.pending ?? 0,
    recorded: stats?.recorded ?? 0,
    missing_information: stats?.missing ?? 0,
    not_eligible: stats?.notEligible ?? 0,
  };

  const invalidateAll = () => {
    utils.admin.assessorList.invalidate();
    utils.admin.assessorStats.invalidate();
  };

  const approveClientMutation = trpc.admin.approveClient.useMutation({
    onSuccess: () => { toast.success("Client approved successfully"); invalidateAll(); setConfirmApproveId(null); },
    onError: (err) => toast.error(err.message),
  });

  const rejectClientMutation = trpc.admin.rejectClient.useMutation({
    onSuccess: () => { toast.success("Client rejected"); invalidateAll(); setRejectId(null); setRejectReason(""); },
    onError: (err) => toast.error(err.message),
  });

  const markMissingInfoMutation = trpc.admin.markMissingInfo.useMutation({
    onSuccess: () => { toast.success("Client flagged for missing information"); invalidateAll(); setMissingId(null); setMissingNote(""); },
    onError: (err) => toast.error(err.message),
  });

  const markNotEligibleMutation = trpc.admin.markNotEligible.useMutation({
    onSuccess: () => { toast.success("Client marked as not eligible"); invalidateAll(); setNotEligibleId(null); setNotEligibleReason(""); },
    onError: (err) => toast.error(err.message),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user || (user.role !== "assessor" && user.role !== "admin" && user.role !== "super_admin")) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Access denied. Assessor login required.</p>
          <Button onClick={() => navigate("/admin/login")}>Go to Login</Button>
        </div>
      </div>
    );
  }

  const rows = (clients as any[]) || [];
  const tabCfg = TAB_CONFIG[activeTab];
  const isAssessorRole = user.role === "assessor";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <ClipboardList className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">Assessor Portal</h1>
            <p className="text-xs text-slate-500">FreshSelect Meals — Assessment Review</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{user.name}</span>
          <Button variant="outline" size="sm" onClick={logout} className="gap-1.5 text-xs">
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* ── Dashboard Stats ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
              {isAssessorRole ? "My Caseload Overview" : "All Assessments Overview"}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Total */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:col-span-1 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-slate-500">
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium">Total Assigned</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {stats ? stats.total : <span className="text-slate-300">—</span>}
              </p>
              <p className="text-xs text-slate-400">{isAssessorRole ? "clients assigned to me" : "all assessment clients"}</p>
            </div>

            {/* Pending */}
            <div
              className="bg-amber-50 rounded-xl border border-amber-100 p-4 flex flex-col gap-1 cursor-pointer hover:border-amber-300 transition-colors"
              onClick={() => setActiveTab("pending")}
            >
              <div className="flex items-center gap-2 text-amber-600">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Pending</span>
              </div>
              <p className="text-2xl font-bold text-amber-700">
                {stats ? stats.pending : <span className="text-amber-200">—</span>}
              </p>
              <p className="text-xs text-amber-500">awaiting review</p>
            </div>

            {/* Recorded */}
            <div
              className="bg-sky-50 rounded-xl border border-sky-100 p-4 flex flex-col gap-1 cursor-pointer hover:border-sky-300 transition-colors"
              onClick={() => setActiveTab("recorded")}
            >
              <div className="flex items-center gap-2 text-sky-600">
                <FolderCheck className="h-4 w-4" />
                <span className="text-xs font-medium">Recorded</span>
              </div>
              <p className="text-2xl font-bold text-sky-700">
                {stats ? stats.recorded : <span className="text-sky-200">—</span>}
              </p>
              <p className="text-xs text-sky-500">assessment recorded</p>
            </div>

            {/* Missing Info */}
            <div
              className="bg-orange-50 rounded-xl border border-orange-100 p-4 flex flex-col gap-1 cursor-pointer hover:border-orange-300 transition-colors"
              onClick={() => setActiveTab("missing_information")}
            >
              <div className="flex items-center gap-2 text-orange-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Missing Info</span>
              </div>
              <p className="text-2xl font-bold text-orange-700">
                {stats ? stats.missing : <span className="text-orange-200">—</span>}
              </p>
              <p className="text-xs text-orange-500">need follow-up</p>
            </div>

            {/* Not Eligible */}
            <div
              className="bg-rose-50 rounded-xl border border-rose-100 p-4 flex flex-col gap-1 cursor-pointer hover:border-rose-300 transition-colors"
              onClick={() => setActiveTab("not_eligible")}
            >
              <div className="flex items-center gap-2 text-rose-600">
                <Ban className="h-4 w-4" />
                <span className="text-xs font-medium">Not Eligible</span>
              </div>
              <p className="text-2xl font-bold text-rose-700">
                {stats ? stats.notEligible : <span className="text-rose-200">—</span>}
              </p>
              <p className="text-xs text-rose-500">ineligible clients</p>
            </div>
          </div>

          {/* Completion progress bar */}
          {stats && stats.total > 0 && (
            <div className="mt-3 bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-slate-600">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium">Assessment Progress</span>
                </div>
                <span className="text-xs text-slate-500">
                  {stats.recorded} of {stats.total} completed ({Math.round((stats.recorded / stats.total) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((stats.recorded / stats.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Pipeline ────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
              {isAssessorRole ? "My Client Pipeline" : "All Client Pipeline"}
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 mb-5 bg-slate-100 p-1 rounded-lg w-fit">
            {(Object.entries(TAB_CONFIG) as [Tab, typeof TAB_CONFIG[Tab]][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => { setActiveTab(key); setSearchInput(""); setSearch(""); setPriorityFilter("all"); setNewApplicantFilter("all"); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {cfg.icon}
                <span className="hidden sm:inline">{cfg.label}</span>
                {counts[key] > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    activeTab === key ? cfg.badgeClass : "bg-slate-200 text-slate-600"
                  }`}>
                    {counts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search by name or CIN..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[160px] bg-white">
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Urgent
                  </span>
                </SelectItem>
                <SelectItem value="high">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-400" /> High
                  </span>
                </SelectItem>
                <SelectItem value="normal">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400" /> Normal
                  </span>
                </SelectItem>
                <SelectItem value="low">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-slate-300" /> Low
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={newApplicantFilter} onValueChange={setNewApplicantFilter}>
              <SelectTrigger className="w-[160px] bg-white">
                <SelectValue placeholder="New / Transfer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">New &amp; Transfer</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            {(priorityFilter !== "all" || newApplicantFilter !== "all") && (
              <button
                onClick={() => { setPriorityFilter("all"); setNewApplicantFilter("all"); }}
                className="text-xs text-slate-500 hover:text-slate-700 underline self-center"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="flex justify-center mb-3 text-slate-300">{tabCfg.icon}</div>
              <p className="text-slate-600 font-medium">{tabCfg.emptyTitle}</p>
              <p className="text-sm text-slate-400 mt-1">{tabCfg.emptyDesc}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden admin-table-wrap">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">CIN / Medicaid ID</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assessment Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {activeTab === "missing_information" ? "Missing Info Note" : activeTab === "not_eligible" ? "Reason" : "Status"}
                    </th>
                    {activeTab === "pending" && (
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((client: any) => (
                    <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/assessor/clients/${client.id}`}>
                          <span className="font-medium text-slate-900 hover:text-emerald-600 cursor-pointer">
                            {client.firstName} {client.lastName}
                          </span>
                        </Link>
                        {client.cellPhone && (
                          <p className="text-xs text-slate-400 mt-0.5">{client.cellPhone}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{client.medicaidId || "—"}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">
                        {client.assessmentCompletedAt
                          ? new Date(client.assessmentCompletedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        {activeTab === "missing_information" ? (
                          <p className="text-sm text-orange-700 max-w-xs">{client.missingInfoNote || "—"}</p>
                        ) : activeTab === "not_eligible" ? (
                          <p className="text-sm text-rose-700 max-w-xs">{client.notEligibleReason || "—"}</p>
                        ) : activeTab === "recorded" ? (
                          <Badge className="bg-sky-100 text-sky-700 text-xs">Assessment Recorded</Badge>
                        ) : client.status === "approved" ? (
                          <div>
                            <Badge className="bg-emerald-100 text-emerald-700 text-xs">Approved</Badge>
                            {client.approvedBy && <p className="text-xs text-slate-400 mt-0.5">by {client.approvedBy}</p>}
                          </div>
                        ) : client.status === "rejected" ? (
                          <div>
                            <Badge className="bg-red-100 text-red-700 text-xs">Rejected</Badge>
                            {client.rejectedBy && <p className="text-xs text-slate-400 mt-0.5">by {client.rejectedBy}</p>}
                          </div>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 text-xs">Pending Review</Badge>
                        )}
                      </td>
                      {activeTab === "pending" && (
                        <td className="px-5 py-3.5 text-right">
                          {client.status === "approved" ? (
                            <span className="text-xs text-emerald-600 flex items-center justify-end gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                            </span>
                          ) : client.status === "rejected" ? (
                            <span className="text-xs text-red-500 flex items-center justify-end gap-1">
                              <XCircle className="h-3.5 w-3.5" /> Rejected
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-orange-200 text-orange-600 hover:bg-orange-50 text-xs h-7 px-2.5"
                                onClick={() => { setMissingId(client.id); setMissingName(`${client.firstName} ${client.lastName}`); setMissingNote(""); }}
                              >
                                <AlertCircle className="h-3.5 w-3.5 mr-1" /> Missing Info
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-rose-200 text-rose-600 hover:bg-rose-50 text-xs h-7 px-2.5"
                                onClick={() => { setNotEligibleId(client.id); setNotEligibleName(`${client.firstName} ${client.lastName}`); setNotEligibleReason(""); }}
                              >
                                <Ban className="h-3.5 w-3.5 mr-1" /> Not Eligible
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-7 px-2.5"
                                onClick={() => { setRejectId(client.id); setRejectName(`${client.firstName} ${client.lastName}`); setRejectReason(""); }}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                              </Button>
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-2.5"
                                onClick={() => { setConfirmApproveId(client.id); setConfirmApproveName(`${client.firstName} ${client.lastName}`); }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-slate-400 mt-4 text-center">
            Showing {rows.length} client{rows.length !== 1 ? "s" : ""} — {tabCfg.label}
            {(priorityFilter !== "all" || newApplicantFilter !== "all") && (
              <span className="ml-1 text-emerald-600 font-medium">(filtered)</span>
            )}
          </p>
        </div>
      </main>

      {/* Confirm Approve Dialog */}
      <AlertDialog open={confirmApproveId !== null} onOpenChange={(open) => { if (!open) setConfirmApproveId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve <strong>{confirmApproveName}</strong>? This will mark their status as Approved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => confirmApproveId !== null && approveClientMutation.mutate({ id: confirmApproveId })}
              disabled={approveClientMutation.isPending}
            >
              {approveClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={rejectId !== null} onOpenChange={(open) => { if (!open) { setRejectId(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Client</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              You are about to reject <strong>{rejectName}</strong>. Please provide a reason (optional).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Reason for Rejection</Label>
              <Textarea id="reject-reason" placeholder="e.g. Incomplete documentation, ineligible based on criteria..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectId !== null && rejectClientMutation.mutate({ id: rejectId, reason: rejectReason || undefined })} disabled={rejectClientMutation.isPending}>
              {rejectClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Missing Info Dialog */}
      <Dialog open={missingId !== null} onOpenChange={(open) => { if (!open) { setMissingId(null); setMissingNote(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Flag Missing Information</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              What information is missing for <strong>{missingName}</strong>?
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="missing-note">Missing Information Note <span className="text-red-500">*</span></Label>
              <Textarea id="missing-note" placeholder="e.g. Missing Medicaid ID, proof of address required..." value={missingNote} onChange={(e) => setMissingNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMissingId(null); setMissingNote(""); }}>Cancel</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => missingId !== null && missingNote.trim() && markMissingInfoMutation.mutate({ id: missingId, note: missingNote.trim() })}
              disabled={markMissingInfoMutation.isPending || !missingNote.trim()}
            >
              {markMissingInfoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertCircle className="h-4 w-4 mr-2" />}
              Flag as Missing Info
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Not Eligible Dialog */}
      <Dialog open={notEligibleId !== null} onOpenChange={(open) => { if (!open) { setNotEligibleId(null); setNotEligibleReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark as Not Eligible</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              Why is <strong>{notEligibleName}</strong> not eligible?
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="not-eligible-reason">Reason <span className="text-red-500">*</span></Label>
              <Textarea id="not-eligible-reason" placeholder="e.g. Does not meet income criteria, not a Medicaid member..." value={notEligibleReason} onChange={(e) => setNotEligibleReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNotEligibleId(null); setNotEligibleReason(""); }}>Cancel</Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => notEligibleId !== null && notEligibleReason.trim() && markNotEligibleMutation.mutate({ id: notEligibleId, reason: notEligibleReason.trim() })}
              disabled={markNotEligibleMutation.isPending || !notEligibleReason.trim()}
            >
              {markNotEligibleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
              Confirm Not Eligible
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
