import { useState } from "react";
import { Link } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ScrollText, ChevronLeft, ChevronRight, Search, RefreshCw,
  ChevronDown, ChevronUp, LogIn, LogOut, UserCog, FileText,
  Trash2, Mail, ClipboardList, Activity, Shield, Link2, Users,
  Edit, CheckCircle, AlertCircle, ArrowRightLeft, Key, Eye, List,
  Globe,
} from "lucide-react";

// ─── Action registry ──────────────────────────────────────────────────────────
const ACTION_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  // Auth
  login_success:              { label: "Login",                  color: "bg-green-100 text-green-800",   icon: LogIn },
  login_failed:               { label: "Login Failed",           color: "bg-red-100 text-red-800",       icon: AlertCircle },
  logout:                     { label: "Logout",                 color: "bg-slate-100 text-slate-700",   icon: LogOut },
  password_reset:             { label: "Password Reset",         color: "bg-yellow-100 text-yellow-800", icon: Key },
  // Navigation
  page_view:                  { label: "Page View",              color: "bg-sky-50 text-sky-600",        icon: Globe },
  // Client lifecycle
  stage_changed:              { label: "Stage Changed",          color: "bg-blue-100 text-blue-800",     icon: ArrowRightLeft },
  status_changed:             { label: "Status Changed",         color: "bg-indigo-100 text-indigo-800", icon: Activity },
  priority_changed:           { label: "Priority Changed",       color: "bg-orange-100 text-orange-800", icon: Activity },
  assignment_changed:         { label: "Assignment Changed",     color: "bg-cyan-100 text-cyan-800",     icon: UserCog },
  client_edited:              { label: "Client Edited",          color: "bg-purple-100 text-purple-800", icon: Edit },
  client_deleted:             { label: "Client Deleted",         color: "bg-red-100 text-red-800",       icon: Trash2 },
  bulk_deleted:               { label: "Bulk Deleted",           color: "bg-red-200 text-red-900",       icon: Trash2 },
  duplicate_deleted:          { label: "Duplicate Deleted",      color: "bg-rose-100 text-rose-800",     icon: Trash2 },
  client_approved:            { label: "Client Approved",        color: "bg-emerald-100 text-emerald-800", icon: CheckCircle },
  client_rejected:            { label: "Client Rejected",        color: "bg-rose-100 text-rose-800",     icon: AlertCircle },
  // Assessment
  assessment_completed:       { label: "Assessment Completed",   color: "bg-green-100 text-green-800",   icon: CheckCircle },
  assessment_incomplete:      { label: "Assessment Incomplete",  color: "bg-yellow-100 text-yellow-800", icon: AlertCircle },
  scn_edited:                 { label: "SCN Edited",             color: "bg-purple-100 text-purple-800", icon: Edit },
  notes_edited:               { label: "Notes Edited",           color: "bg-orange-100 text-orange-800", icon: FileText },
  // Tasks
  task_created:               { label: "Task Created",           color: "bg-teal-100 text-teal-800",     icon: ClipboardList },
  task_status_changed:        { label: "Task Updated",           color: "bg-teal-100 text-teal-800",     icon: ClipboardList },
  // Documents
  document_uploaded:          { label: "Document Uploaded",      color: "bg-sky-100 text-sky-800",       icon: FileText },
  document_deleted:           { label: "Document Deleted",       color: "bg-rose-100 text-rose-800",     icon: Trash2 },
  // Services
  service_created:            { label: "Service Created",        color: "bg-lime-100 text-lime-800",     icon: CheckCircle },
  service_status_changed:     { label: "Service Updated",        color: "bg-lime-100 text-lime-800",     icon: Activity },
  // Emails
  email_sent:                 { label: "Email Sent",             color: "bg-blue-100 text-blue-800",     icon: Mail },
  email_deleted:              { label: "Email Deleted",          color: "bg-rose-100 text-rose-800",     icon: Trash2 },
  // Case notes
  case_note_added:            { label: "Case Note Added",        color: "bg-amber-100 text-amber-800",   icon: FileText },
  // Workers
  worker_promoted:            { label: "Worker Promoted",        color: "bg-violet-100 text-violet-800", icon: Users },
  worker_demoted:             { label: "Worker Demoted",         color: "bg-slate-100 text-slate-700",   icon: Users },
  worker_activated:           { label: "Worker Activated",       color: "bg-green-100 text-green-800",   icon: Users },
  worker_deactivated:         { label: "Worker Deactivated",     color: "bg-red-100 text-red-800",       icon: Users },
  worker_permissions_updated: { label: "Permissions Updated",    color: "bg-violet-100 text-violet-800", icon: Shield },
  // Referral links
  referral_link_created:      { label: "Referral Link Created",  color: "bg-cyan-100 text-cyan-800",     icon: Link2 },
  referral_link_updated:      { label: "Referral Link Updated",  color: "bg-cyan-100 text-cyan-800",     icon: Link2 },
  referral_link_deleted:      { label: "Referral Link Deleted",  color: "bg-rose-100 text-rose-800",     icon: Trash2 },
};

const ACTION_GROUPS: Record<string, string[]> = {
  "Auth Events":    ["login_success", "login_failed", "logout", "password_reset"],
  "Navigation":     ["page_view"],
  "Client Changes": ["stage_changed", "status_changed", "priority_changed", "assignment_changed", "client_edited", "client_deleted", "bulk_deleted", "duplicate_deleted", "client_approved", "client_rejected"],
  "Assessment":     ["assessment_completed", "assessment_incomplete", "scn_edited", "notes_edited"],
  "Tasks":          ["task_created", "task_status_changed"],
  "Documents":      ["document_uploaded", "document_deleted"],
  "Services":       ["service_created", "service_status_changed"],
  "Emails":         ["email_sent", "email_deleted"],
  "Case Notes":     ["case_note_added"],
  "Workers":        ["worker_promoted", "worker_demoted", "worker_activated", "worker_deactivated", "worker_permissions_updated"],
  "Referral Links": ["referral_link_created", "referral_link_updated", "referral_link_deleted"],
};

// ─── Detail renderer ─────────────────────────────────────────────────────────
function DetailView({ action, details }: { action: string; details: unknown }) {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;

  if (action === "page_view") {
    const pvTitle = String(d.title ?? d.path ?? "—");
    const pvPath = d.path ? String(d.path) : "";
    const pvShowPath = pvPath && pvTitle !== pvPath;
    return (
      <span className="text-sky-700">
        {pvTitle}
        {pvShowPath && (
          <span className="text-slate-400 ml-1 font-mono text-xs">({pvPath})</span>
        )}
      </span>
    );
  }

  if (action === "stage_changed" || action === "status_changed" || action === "priority_changed") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium text-slate-500">{String(d.from ?? "—")}</span>
        <ArrowRightLeft className="h-3 w-3 text-slate-400" />
        <span className="font-medium text-slate-800">{String(d.to ?? "—")}</span>
      </span>
    );
  }

  if (action === "client_edited" && d.changedFields && typeof d.changedFields === "object") {
    const cf = d.changedFields as Record<string, { from: unknown; to: unknown }>;
    const entries = Object.entries(cf);
    if (entries.length === 0) return <span className="text-slate-400 italic">No field changes recorded</span>;
    return (
      <div className="space-y-1">
        {entries.map(([field, { from, to }]) => (
          <div key={field} className="flex items-center gap-1.5 text-xs">
            <span className="font-mono text-slate-500 bg-slate-100 px-1 rounded">{field}</span>
            <span className="text-slate-400">{String(from ?? "—")}</span>
            <ArrowRightLeft className="h-3 w-3 text-slate-400 shrink-0" />
            <span className="text-slate-800 font-medium">{String(to ?? "—")}</span>
          </div>
        ))}
      </div>
    );
  }

  if (action === "assignment_changed") {
    const parts: string[] = [];
    if (d.assignedTo !== undefined) parts.push(`Worker → ${d.assignedTo === null ? "Unassigned" : `#${d.assignedTo}`}`);
    if (d.intakeRep !== undefined) parts.push(`Intake Rep → ${d.intakeRep === null ? "Unassigned" : `#${d.intakeRep}`}`);
    return <span>{parts.join(" · ")}</span>;
  }

  if (action === "task_created") {
    return <span>{String(d.description ?? "")} <span className="text-slate-400">({String(d.area ?? "")})</span></span>;
  }
  if (action === "task_status_changed") {
    return <span>Status → <span className="font-medium">{String(d.status ?? "")}</span></span>;
  }
  if (action === "document_uploaded") {
    return <span>{String(d.name ?? "")} <span className="text-slate-400">({String(d.category ?? "")})</span></span>;
  }
  if (action === "service_created") return <span>{String(d.name ?? "")}</span>;
  if (action === "service_status_changed") {
    return <span>Status → <span className="font-medium">{String(d.status ?? "")}</span></span>;
  }
  if (action === "email_sent") {
    return <span>To: {String(d.to ?? "—")} · Subject: <span className="italic">{String(d.subject ?? "—")}</span></span>;
  }
  if (action === "case_note_added") {
    return <span className="italic text-slate-600">"{String(d.preview ?? "")}{String(d.preview ?? "").length >= 120 ? "…" : ""}"</span>;
  }
  if (action === "login_failed") {
    return <span>Reason: {String(d.reason ?? "—")} {d.email ? `· ${String(d.email)}` : ""} {d.ip ? `· IP: ${String(d.ip)}` : ""}</span>;
  }
  if (action === "login_success") {
    return <span>{d.email ? String(d.email) : ""} {d.ip ? `· IP: ${String(d.ip)}` : ""} {d.portal ? `· ${String(d.portal)}` : ""}</span>;
  }
  if (action === "logout") return d.ip ? <span>IP: {String(d.ip)}</span> : null;
  if (action === "bulk_deleted") {
    return <span>{String(d.count ?? 0)} client{Number(d.count) !== 1 ? "s" : ""} deleted</span>;
  }
  if (action === "worker_promoted" || action === "worker_permissions_updated") {
    const perms = d.permissions as Record<string, boolean> | undefined;
    if (perms) {
      const active = Object.entries(perms).filter(([, v]) => v).map(([k]) => k).join(", ");
      return <span>User #{String(d.userId ?? "")} · Permissions: {active || "none"}</span>;
    }
    return <span>User #{String(d.userId ?? "")}</span>;
  }
  if (action === "referral_link_created") {
    return <span>Code: <span className="font-mono">{String(d.code ?? "")}</span> · {String(d.referrerName ?? "")}</span>;
  }
  if (action === "referral_link_updated") {
    const changes = Array.isArray(d.changes) ? (d.changes as string[]).join(", ") : "";
    return <span>Link #{String(d.id ?? "")} · Changed: {changes}</span>;
  }
  if (action === "client_rejected" && d.reason) return <span>Reason: {String(d.reason)}</span>;

  const entries = Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return (
    <span className="text-xs text-slate-500">
      {entries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}
    </span>
  );
}

// ─── Session Timeline Row ─────────────────────────────────────────────────────
function SessionTimeline({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = trpc.auditLog.getSessionActivity.useQuery({ sessionId });
  const events = (data ?? []) as any[];

  if (isLoading) {
    return (
      <tr className="bg-slate-50/80 border-b">
        <td colSpan={6} className="px-8 py-4 text-slate-400 text-sm">Loading session activity…</td>
      </tr>
    );
  }

  if (events.length === 0) {
    return (
      <tr className="bg-slate-50/80 border-b">
        <td colSpan={6} className="px-8 py-4 text-slate-400 text-sm italic">No activity recorded for this session.</td>
      </tr>
    );
  }

  return (
    <tr className="bg-slate-50/80 border-b">
      <td colSpan={6} className="px-0 py-0">
        <div className="px-8 py-3 space-y-0">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-2">
            Session Timeline · {events.length} event{events.length !== 1 ? "s" : ""}
          </div>
          <div className="relative border-l-2 border-slate-200 ml-2 space-y-0">
            {events.map((ev: any, idx: number) => {
              const meta = ACTION_META[ev.action] ?? { label: ev.action, color: "bg-slate-100 text-slate-700", icon: Activity };
              const Icon = meta.icon;
              const isLogin = ev.action === "login_success";
              const isLogout = ev.action === "logout";
              return (
                <div
                  key={ev.id}
                  className={"relative flex items-start gap-3 px-4 py-2 " + (isLogin || isLogout ? "opacity-60" : "")}
                >
                  {/* Timeline dot */}
                  <div className={"absolute -left-[9px] top-3 h-4 w-4 rounded-full border-2 border-white flex items-center justify-center " + (isLogin ? "bg-green-400" : isLogout ? "bg-slate-400" : "bg-white border-slate-300")}>
                    <Icon className="h-2.5 w-2.5 text-slate-500" />
                  </div>

                  {/* Time */}
                  <span className="text-xs text-slate-400 whitespace-nowrap w-20 shrink-0 pt-0.5">
                    {new Date(ev.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>

                  {/* Badge */}
                  <span className={"inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium shrink-0 " + meta.color}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>

                  {/* Client link */}
                  {ev.clientId && (
                    <Link href={"/admin/clients/" + ev.clientId}>
                      <span className="text-green-700 hover:underline text-xs font-medium shrink-0">
                        {ev.clientName ?? "Client #" + ev.clientId}
                      </span>
                    </Link>
                  )}

                  {/* Detail */}
                  <span className="text-xs text-slate-500 min-w-0 truncate">
                    <DetailView action={ev.action} details={ev.details} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"flat" | "session">("flat");

  // Load staff list for the filter dropdown
  const staffQuery = trpc.admin.staffList.useQuery();
  const staffList = (staffQuery.data ?? []) as any[];

  const { data, isLoading, refetch } = trpc.auditLog.list.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      action: actionFilter !== "all" ? actionFilter : undefined,
      actorId: staffFilter !== "all" ? parseInt(staffFilter) : undefined,
    },
    { keepPreviousData: true } as any
  );

  const rows = (data?.rows ?? []) as any[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered = searchText
    ? rows.filter((r: any) =>
        (r.actorName ?? "").toLowerCase().includes(searchText.toLowerCase()) ||
        (r.clientName ?? "").toLowerCase().includes(searchText.toLowerCase())
      )
    : rows;

  // Group by session for session view
  const sessionGroups: { sessionId: string | null; loginRow: any; rows: any[] }[] = [];
  if (viewMode === "session") {
    const seen = new Map<string, number>(); // sessionId → index in sessionGroups
    for (const row of filtered) {
      const sid = row.sessionId as string | null;
      if (!sid) {
        // No session — treat as standalone
        sessionGroups.push({ sessionId: null, loginRow: row, rows: [row] });
      } else if (seen.has(sid)) {
        // Add to existing group
        const idx = seen.get(sid)!;
        sessionGroups[idx].rows.push(row);
        // Update loginRow if this is the login event
        if (row.action === "login_success") sessionGroups[idx].loginRow = row;
      } else {
        seen.set(sid, sessionGroups.length);
        sessionGroups.push({ sessionId: sid, loginRow: row, rows: [row] });
      }
    }
  }

  function handleSearch() { setSearchText(searchInput); setPage(1); }
  function handleActionChange(val: string) { setActionFilter(val); setPage(1); }
  function handleStaffChange(val: string) { setStaffFilter(val); setPage(1); setSearchText(""); setSearchInput(""); }
  function toggleRow(id: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSession(sid: string) {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      next.has(sid) ? next.delete(sid) : next.add(sid);
      return next;
    });
  }

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ScrollText className="h-6 w-6 text-green-700 shrink-0" />
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
              <p className="text-sm text-slate-500">Immutable record of every action — logins, edits, deletions, and more</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* View mode toggle */}
            <div className="flex rounded-md border border-slate-200 overflow-hidden text-sm">
              <button
                className={"px-3 py-1.5 flex items-center gap-1.5 transition-colors " + (viewMode === "flat" ? "bg-green-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
                onClick={() => setViewMode("flat")}
              >
                <List className="h-3.5 w-3.5" /> Flat
              </button>
              <button
                className={"px-3 py-1.5 flex items-center gap-1.5 transition-colors border-l border-slate-200 " + (viewMode === "session" ? "bg-green-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
                onClick={() => setViewMode("session")}
              >
                <Eye className="h-3.5 w-3.5" /> By Session
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Action Type filter */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Action Type</label>
                <Select value={actionFilter} onValueChange={handleActionChange}>
                  <SelectTrigger className="w-52"><SelectValue placeholder="All actions" /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="all">All Actions</SelectItem>
                    {Object.entries(ACTION_GROUPS).map(([group, keys]) => (
                      <div key={group}>
                        <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide mt-1">{group}</div>
                        {keys.map((key) => (
                          <SelectItem key={key} value={key}>
                            {ACTION_META[key]?.label ?? key}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Staff Member filter */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Staff Member</label>
                <Select value={staffFilter} onValueChange={handleStaffChange}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="All staff" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">All Staff</SelectItem>
                    {staffList.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        <span className="flex items-center gap-2">
                          <span>{s.name || s.email}</span>
                          <span className="text-xs text-slate-400 capitalize">{s.role}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Client name search (client-side within current page) */}
              <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                <label className="text-xs font-medium text-slate-600">Search Client Name</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Client name…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleSearch} className="gap-1 bg-green-700 hover:bg-green-800 text-white">
                    <Search className="h-4 w-4" /> Search
                  </Button>
                </div>
              </div>

              {/* Active filter indicator + clear */}
              <div className="flex items-end gap-2 pb-0.5">
                {(staffFilter !== "all" || actionFilter !== "all" || searchText) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500 hover:text-slate-700 gap-1 text-xs"
                    onClick={() => {
                      setStaffFilter("all");
                      setActionFilter("all");
                      setSearchText("");
                      setSearchInput("");
                      setPage(1);
                    }}
                  >
                    <span>✕</span> Clear filters
                  </Button>
                )}
                <div className="text-sm text-slate-500">
                  {total.toLocaleString()} event{total !== 1 ? "s" : ""}
                  {staffFilter !== "all" && (
                    <span className="ml-1 text-xs text-green-700 font-medium">
                      · {staffList.find((s: any) => String(s.id) === staffFilter)?.name || "Staff"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Session View ── */}
        {viewMode === "session" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-green-700" /> Sessions
                <span className="text-xs font-normal text-slate-400 ml-1">Click a session to expand its full activity timeline</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-slate-400">Loading…</div>
              ) : sessionGroups.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No events found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-slate-600">
                        <th className="w-8 px-3"></th>
                        <th className="text-left px-4 py-3 font-medium w-40">Login Time</th>
                        <th className="text-left px-4 py-3 font-medium w-44">Staff Member</th>
                        <th className="text-left px-4 py-3 font-medium w-32">Role</th>
                        <th className="text-left px-4 py-3 font-medium">Summary</th>
                        <th className="text-left px-4 py-3 font-medium w-20">Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionGroups.map((group, gi) => {
                        const loginRow = group.loginRow;
                        const sid = group.sessionId;
                        const isExpanded = sid ? expandedSessions.has(sid) : false;
                        const loginDetails = loginRow.details as Record<string, unknown> | null;
                        const role = loginDetails?.role as string | undefined;
                        // Count meaningful actions (exclude page_view and login/logout)
                        const actionCount = group.rows.filter((r: any) => r.action !== "page_view" && r.action !== "login_success" && r.action !== "logout").length;
                        const pageCount = group.rows.filter((r: any) => r.action === "page_view").length;

                        return (
                          <>
                            <tr
                              key={gi}
                              className={"border-b hover:bg-slate-50 transition-colors " + (sid ? "cursor-pointer" : "")}
                              onClick={() => sid && toggleSession(sid)}
                            >
                              <td className="px-3 py-3 text-slate-400">
                                {sid && (isExpanded
                                  ? <ChevronUp className="h-4 w-4" />
                                  : <ChevronDown className="h-4 w-4" />
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                                {new Date(loginRow.createdAt).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-slate-700 font-medium">
                                {loginRow.actorName ?? <span className="text-slate-400 italic">Unknown</span>}
                              </td>
                              <td className="px-4 py-3">
                                {role && (
                                  <Badge variant="outline" className="text-xs capitalize">{role}</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500">
                                {actionCount > 0 && (
                                  <span className="mr-3 text-slate-700 font-medium">{actionCount} action{actionCount !== 1 ? "s" : ""}</span>
                                )}
                                {pageCount > 0 && (
                                  <span className="text-sky-600">{pageCount} page view{pageCount !== 1 ? "s" : ""}</span>
                                )}
                                {actionCount === 0 && pageCount === 0 && !sid && (
                                  <span className="italic text-slate-400">No session data</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <Badge className="bg-slate-100 text-slate-700 text-xs">{group.rows.length}</Badge>
                              </td>
                            </tr>
                            {isExpanded && sid && <SessionTimeline key={sid + "-timeline"} sessionId={sid} />}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Flat View ── */}
        {viewMode === "flat" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Events</CardTitle></CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-slate-400">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No audit events found. Events will appear here as staff take actions.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-slate-600">
                        <th className="text-left px-4 py-3 font-medium w-40">Timestamp</th>
                        <th className="text-left px-4 py-3 font-medium w-48">Action</th>
                        <th className="text-left px-4 py-3 font-medium w-40">Staff Member</th>
                        <th className="text-left px-4 py-3 font-medium w-40">Client</th>
                        <th className="text-left px-4 py-3 font-medium">Details</th>
                        <th className="w-8 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row: any, i: number) => {
                        const meta = ACTION_META[row.action] ?? { label: row.action, color: "bg-slate-100 text-slate-700", icon: Activity };
                        const Icon = meta.icon;
                        const isExpanded = expandedRows.has(row.id);
                        const hasRawDetails = row.details && typeof row.details === "object" && Object.keys(row.details).length > 0;
                        return (
                          <>
                            <tr
                              key={row.id}
                              className={"border-b last:border-0 hover:bg-slate-50 transition-colors cursor-pointer " + (i % 2 === 0 ? "" : "bg-slate-50/40")}
                              onClick={() => hasRawDetails && toggleRow(row.id)}
                            >
                              <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                                {new Date(row.createdAt).toLocaleString()}
                              </td>
                              <td className="px-4 py-3">
                                <span className={"inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium " + meta.color}>
                                  <Icon className="h-3 w-3" />
                                  {meta.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-700 font-medium">
                                {row.actorName ?? <span className="text-slate-400 italic">System</span>}
                              </td>
                              <td className="px-4 py-3">
                                {row.clientId ? (
                                  <Link href={"/admin/clients/" + row.clientId} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                    <span className="text-green-700 hover:underline cursor-pointer font-medium">
                                      {row.clientName ?? "Client #" + row.clientId}
                                    </span>
                                  </Link>
                                ) : (
                                  <span className="text-slate-400 italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600 text-xs max-w-xs">
                                <DetailView action={row.action} details={row.details} />
                              </td>
                              <td className="px-2 py-3 text-slate-400">
                                {hasRawDetails && (
                                  isExpanded
                                    ? <ChevronUp className="h-4 w-4" />
                                    : <ChevronDown className="h-4 w-4" />
                                )}
                              </td>
                            </tr>
                            {isExpanded && hasRawDetails && (
                              <tr key={row.id + "-expanded"} className="bg-slate-50 border-b">
                                <td colSpan={6} className="px-6 py-3">
                                  <div className="text-xs font-mono text-slate-600 bg-white border rounded p-3 overflow-x-auto">
                                    <div className="text-xs font-semibold text-slate-400 mb-1 font-sans">Raw Details</div>
                                    {JSON.stringify(row.details, null, 2)}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Page {page} of {totalPages} ({total.toLocaleString()} total events)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="gap-1">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
