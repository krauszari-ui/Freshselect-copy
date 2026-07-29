/**
 * AdminChatInbox — Global chat inbox showing all client threads.
 * Teams/WhatsApp-style two-panel layout: thread list on left, active chat on right.
 */
import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { ClientChatTab } from "@/components/ClientChatTab";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import {
  MessageSquare, Search, Loader2, Users, Clock,
} from "lucide-react";
import { Link } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date | string | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function getStageBadgeColor(stage: string) {
  const map: Record<string, string> = {
    referral: "bg-blue-100 text-blue-700",
    intake: "bg-amber-100 text-amber-700",
    active: "bg-emerald-100 text-emerald-700",
    closed: "bg-slate-100 text-slate-500",
    pending: "bg-purple-100 text-purple-700",
  };
  return map[stage?.toLowerCase()] ?? "bg-slate-100 text-slate-500";
}

// ─── Thread Row ───────────────────────────────────────────────────────────────

interface ThreadRowProps {
  thread: {
    submissionId: number;
    clientName: string | null;
    stage: string;
    lastMessage: string | null;
    lastMessageAt: Date | string | null;
    lastSenderName: string | null;
    unreadCount: number;
  };
  isActive: boolean;
  onClick: () => void;
}

function ThreadRow({ thread, isActive, onClick }: ThreadRowProps) {
  const hasUnread = thread.unreadCount > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors hover:bg-slate-50 ${
        isActive ? "bg-emerald-50 border-l-2 border-l-emerald-500" : "border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
          isActive ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"
        }`}>
          {getInitials(thread.clientName)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-sm truncate ${hasUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
              {thread.clientName}
            </span>
            <span className="text-[10px] text-slate-400 flex-shrink-0">
              {formatRelativeTime(thread.lastMessageAt)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs truncate ${hasUnread ? "text-slate-700 font-medium" : "text-slate-400"}`}>
              {thread.lastMessage
                ? (thread.lastSenderName ? `${thread.lastSenderName.split(" ")[0]}: ${thread.lastMessage}` : thread.lastMessage)
                : "No messages yet — start the conversation"}
            </p>
            {hasUnread && (
              <span className="flex-shrink-0 min-w-[18px] h-[18px] bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
              </span>
            )}
          </div>

          {/* Stage badge */}
          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStageBadgeColor(thread.stage)}`}>
            {thread.stage}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminChatInbox() {
  const [search, setSearch] = useState("");
  const [activeThread, setActiveThread] = useState<{ submissionId: number; clientName: string } | null>(null);

  // Load inbox threads (all clients with unread counts + last message preview)
  const { data: threads = [], isLoading } = trpc.chat.inbox.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return threads as any[];
    const q = search.toLowerCase();
    return (threads as any[]).filter((t: any) =>
      t.clientName?.toLowerCase().includes(q) ||
      t.lastMessage?.toLowerCase().includes(q)
    );
  }, [threads, search]);

  const totalUnread = (threads as any[]).reduce((sum: number, t: any) => sum + (t.unreadCount ?? 0), 0);

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-0px)] overflow-hidden">
        {/* ── Left panel: thread list ─────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
          {/* Header */}
          <div className="px-4 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-600" />
                <h1 className="text-base font-semibold text-slate-900">Team Chat</h1>
                {totalUnread > 0 && (
                  <span className="bg-emerald-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400">{(threads as any[]).length} threads</span>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients..."
                className="pl-8 h-8 text-xs bg-slate-50 border-slate-200"
              />
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                <p className="text-xs text-slate-400">Loading threads...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
                <MessageSquare className="h-8 w-8 text-slate-200" />
                <p className="text-sm text-slate-400">
                  {search ? "No threads match your search" : "No client threads yet"}
                </p>
              </div>
            ) : (
              filtered.map((thread: any) => (
                <ThreadRow
                  key={thread.submissionId}
                  thread={thread}
                  isActive={activeThread?.submissionId === thread.submissionId}
                  onClick={() => setActiveThread({ submissionId: thread.submissionId, clientName: thread.clientName })}
                />
              ))
            )}
          </div>

          {/* Footer tip */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-[10px] text-slate-400 text-center">
              Chat threads are per-client. Open a client to start chatting.
            </p>
          </div>
        </div>

        {/* ── Right panel: active chat ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          {activeThread ? (
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 mb-3">
                <Link href={`/admin/clients/${activeThread.submissionId}`}>
                  <span className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer">
                    View full client profile →
                  </span>
                </Link>
              </div>
              <div className="flex-1 overflow-hidden">
                <ClientChatTab
                  submissionId={activeThread.submissionId}
                  clientName={activeThread.clientName}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              {/* Empty state */}
              <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center">
                <MessageSquare className="h-12 w-12 text-emerald-200" />
              </div>
              <div className="text-center max-w-sm">
                <h2 className="text-lg font-semibold text-slate-700 mb-2">Team Chat Inbox</h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Select a client thread on the left to view and send messages. All staff assigned to a client can chat in their thread.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
                {[
                  { icon: MessageSquare, label: "Per-client threads", desc: "One thread per client" },
                  { icon: Users, label: "All staff", desc: "Everyone on the case" },
                  { icon: Clock, label: "Real-time", desc: "Updates every 10s" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
                    <Icon className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-700">{label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
