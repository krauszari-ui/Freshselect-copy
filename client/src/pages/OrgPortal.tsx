import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Search, LogOut, Building2, Users, MessageSquare, Bell,
  ChevronRight, Clock, CheckCircle2, ClipboardList,
} from "lucide-react";
import { CreateTaskFromMessageDialog } from "@/components/CreateTaskFromMessageDialog";
import { useState, useRef } from "react";
import { ReplyBar, ReplyButton, ReplyQuote, type ReplyTarget } from "@/components/ReplyBar";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
// OrgGroupChat component - defined below

export default function OrgPortal() {
  const { user, loading, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activeView, setActiveView] = useState<"clients" | "chat">("clients");

  // ── Auth guard ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) {
    window.location.href = getLoginUrl();
    return null as never;
  }
  // Only org staff (assessor/worker with an orgId) can access this portal
  if (!user.orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-3 max-w-sm p-8 bg-card rounded-xl border shadow-sm">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-semibold">No Organization Assigned</h2>
          <p className="text-sm text-muted-foreground">
            Your account is not assigned to any organization. Please contact your administrator.
          </p>
          <Button variant="outline" onClick={() => logout()}>Sign Out</Button>
        </div>
      </div>
    );
  }

  return <OrgPortalContent user={user} logout={logout} activeView={activeView} setActiveView={setActiveView} search={search} setSearch={setSearch} searchInput={searchInput} setSearchInput={setSearchInput} />;
}

function OrgPortalContent({ user, logout, activeView, setActiveView, search, setSearch, searchInput, setSearchInput }: {
  user: any; logout: () => void;
  activeView: "clients" | "chat"; setActiveView: (v: "clients" | "chat") => void;
  search: string; setSearch: (s: string) => void;
  searchInput: string; setSearchInput: (s: string) => void;
}) {
  const [, navigate] = useLocation();

  // ── Org info ─────────────────────────────────────────────────────────────────
  const { data: orgInfo } = trpc.org.myOrg.useQuery();

  // ── Referred clients ─────────────────────────────────────────────────────────
  const { data: clientsData, isLoading: clientsLoading } = trpc.org.listReferredClients.useQuery({
    search: search.trim() || undefined,
  }, { enabled: !!user?.orgId });
  const clients = clientsData ?? [];

  // ── Unread notification count ─────────────────────────────────────────────────
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  // ── Org group chat unread count (for Group Chat tab badge) ───────────────────
  const { data: groupUnreadData } = trpc.org.groupUnreadCount.useQuery(
    { orgId: user.orgId! },
    { refetchInterval: 15_000, refetchIntervalInBackground: false, enabled: !!user?.orgId },
  );
  const groupUnreadCount = (groupUnreadData as any)?.count ?? 0;

  const handleSearch = () => setSearch(searchInput.trim());

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      {/* Top nav */}
      <header className="bg-card border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-primary" />
            <div>
              <div className="font-semibold text-sm leading-tight">{orgInfo?.name ?? "Organization Portal"}</div>
              <div className="text-xs text-muted-foreground">FreshSelect Meals</div>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            <Button
              variant={activeView === "clients" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveView("clients")}
              className="gap-1.5"
            >
              <Users className="w-4 h-4" /> Clients
            </Button>
              <Button
              variant={activeView === "chat" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveView("chat")}
              className="gap-1.5 relative"
            >
              <MessageSquare className="w-4 h-4" /> Group Chat
              {groupUnreadCount > 0 && activeView !== "chat" && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {groupUnreadCount > 99 ? "99+" : groupUnreadCount}
                </span>
              )}
            </Button>
            <Link href="/org/notifications">
              <Button variant="ghost" size="sm" className="relative gap-1.5">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{user.name ?? user.email}</span>
            <Button variant="ghost" size="sm" onClick={() => logout()} className="gap-1.5">
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {activeView === "clients" && (
          <div className="space-y-5">
            {/* Search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search clients by name, ID, or phone…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch}>Search</Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-card rounded-lg border p-4">
                <div className="text-2xl font-bold">{clients.length}</div>
                <div className="text-sm text-muted-foreground">Your Clients</div>
              </div>
              <div className="bg-card rounded-lg border p-4">
                <div className="text-2xl font-bold">{clients.filter((c: any) => c.stage === "assessment_pending").length}</div>
                <div className="text-sm text-muted-foreground">Pending Assessment</div>
              </div>
              <div className="bg-card rounded-lg border p-4">
                <div className="text-2xl font-bold">{clients.filter((c: any) => c.stage === "assessment_recorded").length}</div>
                <div className="text-sm text-muted-foreground">Assessment Recorded</div>
              </div>
            </div>

            {/* Client list */}
            {clientsLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
            {!clientsLoading && clients.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No clients assigned to your organization yet</p>
                <p className="text-sm mt-1">Clients will appear here once a FreshSelect admin assigns a worker from your org or refers a client directly to your organization.</p>
              </div>
            )}
            <div className="space-y-2">
              {clients.map((client: any) => (
                <Link key={client.id} href={`/org/clients/${client.id}`}>
                  <div className="bg-card border rounded-lg px-4 py-3 flex items-center justify-between hover:bg-accent/40 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {(client.firstName?.[0] ?? "?").toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{client.firstName} {client.lastName}</div>
                        <div className="text-xs text-muted-foreground">
                          ID: {client.id}
                          {client.referralNote && <span className="ml-2 italic">"{client.referralNote}"</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StageBadge stage={client.stage} />
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {activeView === "chat" && (
          <OrgGroupChatPanel orgId={user.orgId!} orgName={orgInfo?.name ?? "Organization"} userId={user.id} userName={user.name ?? user.email ?? ""} />
        )}
      </main>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { label: string; className: string }> = {
    assessment_pending: { label: "Pending", className: "bg-amber-100 text-amber-700" },
    assessment_recorded: { label: "Recorded", className: "bg-sky-100 text-sky-700" },
    missing_information: { label: "Missing Info", className: "bg-orange-100 text-orange-700" },
    not_eligible: { label: "Not Eligible", className: "bg-rose-100 text-rose-700" },
    approved: { label: "Approved", className: "bg-green-100 text-green-700" },
  };
  const cfg = map[stage] ?? { label: stage, className: "bg-muted text-muted-foreground" };
  return <Badge className={`text-xs font-medium ${cfg.className}`}>{cfg.label}</Badge>;
}

// ─── Org Group Chat Panel ─────────────────────────────────────────────────────
function renderOrgContent(content: string, knownNames?: string[]) {
  if (knownNames && knownNames.length > 0) {
    const escaped = [...knownNames]
      .sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(@(?:${escaped.join("|")})(?=\\s|$)|@\\w+)`, "g");
    const parts = content.split(pattern);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return <span key={i} className="text-primary font-semibold">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  }
  // Fallback: only @SingleWord (no spaces)
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (/^@\w+$/.test(part)) {
      return <span key={i} className="text-primary font-semibold">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}
function OrgGroupChatPanel({ orgId, orgName, userId, userName }: {
  orgId: number; orgName: string; userId: number; userName: string;
}) {
  const [text, setText] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [taskDialogMsg, setTaskDialogMsg] = useState<any | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const { data: messages = [], isLoading } = trpc.org.groupMessages.useQuery(
    { orgId },
    { refetchInterval: 10_000, refetchIntervalInBackground: false },
  );
  const { data: staffListRaw = [] } = trpc.chat.staffList.useQuery(undefined, {
    staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const knownNames = (staffListRaw as { name: string }[]).map(u => u.name);
  const sendMsg = trpc.org.sendGroupMessage.useMutation({
    onSuccess: () => {
      utils.org.groupMessages.invalidate({ orgId });
      setText("");
      setReplyTarget(null);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMsg.mutate({ orgId, content: trimmed, replyToId: replyTarget?.id });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-3xl mx-auto rounded-xl overflow-hidden shadow-md border border-slate-200">
      {/* Header - WhatsApp teal */}
      <div className="px-5 py-3.5 bg-[#075E54] flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-semibold text-sm">
          {(orgName ?? "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{orgName} — Group Chat</h2>
          <p className="text-xs text-emerald-200 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            Group channel
          </p>
        </div>
      </div>

      {/* Messages - WhatsApp wallpaper */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-2"
        style={{
          backgroundColor: "#ECE5DD",
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8b8a2' fill-opacity='0.18'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      >
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-center text-slate-500 text-sm py-8">Loading messages…</div>
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <div className="text-center text-slate-500 text-sm py-8">No messages yet. Start the conversation!</div>
          </div>
        )}
        {messages.map((msg: any) => {
          const isMe = msg.senderId === userId;
          const isFreshSelect = !msg.senderOrgName || msg.senderOrgName === "FreshSelect Meals";
          return (
            <div key={msg.id} className={`flex gap-2.5 group ${isMe ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm ${
                isMe ? "bg-[#075E54] text-white" : isFreshSelect ? "bg-[#128C7E] text-white" : "bg-blue-500 text-white"
              }`}>
                {(msg.senderName ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className={`max-w-[70%] flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <div className="flex items-center gap-1.5 ml-1 mb-0.5">
                    <span className="text-xs font-semibold text-slate-700">{msg.senderName}</span>
                    {isFreshSelect && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">FreshSelect</span>
                    )}
                  </div>
                )}
                <div className={`relative rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                  isMe ? "bg-[#DCF8C6] text-slate-800 rounded-tr-sm" : "bg-white text-slate-800 rounded-tl-sm"
                }`}>
                  {msg.replyToId && msg.replyToSenderName && (
                    <ReplyQuote senderName={msg.replyToSenderName} content={msg.replyToContent ?? ""} />
                  )}
                  {renderOrgContent(msg.content, knownNames)}
                  <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                    <span className="text-[10px] text-slate-400">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {/* Reply + Create Task buttons on hover */}
                  <div className={`absolute top-0 ${isMe ? "right-full mr-2" : "left-full ml-2"} hidden group-hover:flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2 py-1 shadow-md z-10`}>
                    <ReplyButton onClick={() => setReplyTarget({ id: msg.id, senderName: msg.senderName, content: msg.content.slice(0, 300) })} />
                    <button
                      onClick={() => setTaskDialogMsg(msg)}
                      className="p-1 rounded-full hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors"
                      title="Create task from this message"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer - WhatsApp style */}
      <div className="px-3 py-2.5 bg-[#F0F0F0] border-t border-[#d9d9d9] flex-shrink-0">
        <ReplyBar replyTarget={replyTarget} onCancel={() => setReplyTarget(null)} />
        <div className="flex items-end gap-2">
          <input
            className="flex-1 rounded-3xl border-0 bg-white shadow-sm text-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-emerald-400 transition-colors min-h-[44px]"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMsg.isPending}
            className="flex-shrink-0 w-11 h-11 rounded-full bg-[#075E54] hover:bg-[#064e46] disabled:bg-slate-300 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shadow-sm"
          >
            {sendMsg.isPending ? (
              <svg className="h-4.5 w-4.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* Create Task from Message dialog */}
      {taskDialogMsg && (
        <CreateTaskFromMessageDialog
          open={!!taskDialogMsg}
          onClose={() => setTaskDialogMsg(null)}
          messageContent={taskDialogMsg.content ?? ""}
          messageId={taskDialogMsg.id}
          messageType="org_group"
          submissionId={0}
          clientName={`${orgName} group chat`}
          onCreated={() => {
            utils.org.groupMessages.invalidate({ orgId });
          }}
        />
      )}
    </div>
  );
}
