/**
 * AdminOrgChats — Org Group Chat Inbox for FreshSelect admins/workers.
 * Two-panel layout: left shows all org channels with unread badges,
 * right shows the active org's group chat with message composer.
 * Supports @WorkerName and @OrgName mentions.
 */
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Input } from "@/components/ui/input";
import {
  Building2, Search, Loader2, MessageSquare, Send, AtSign, ClipboardList,
} from "lucide-react";
import { CreateTaskFromMessageDialog } from "@/components/CreateTaskFromMessageDialog";
import { ReplyBar, ReplyButton, ReplyQuote, type ReplyTarget } from "@/components/ReplyBar";
import { toast } from "sonner";

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffUser {
  id: number;
  name: string;
  role: string;
  email: string;
}

interface OrgItem {
  orgId: number;
  orgName: string;
  unreadCount: number;
  lastMessageContent: string | null;
  lastMessageSender: string | null;
  lastMessageAt: Date | string | null;
}

// ─── Mention Dropdown ─────────────────────────────────────────────────────────

function MentionDropdown({
  query,
  staffUsers,
  orgList,
  onSelectStaff,
  onSelectOrg,
  anchorRef,
}: {
  query: string;
  staffUsers: StaffUser[];
  orgList: OrgItem[];
  onSelectStaff: (u: StaffUser) => void;
  onSelectOrg: (o: OrgItem) => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const filteredStaff = staffUsers.filter(u =>
    u.name.toLowerCase().includes(query.toLowerCase()) ||
    u.email.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 4);

  const filteredOrgs = orgList.filter(o =>
    o.orgName.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 3);

  if (!filteredStaff.length && !filteredOrgs.length) return null;

  return (
    <div className="absolute bottom-full mb-2 left-0 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
          <AtSign className="h-3 w-3" /> Mention a person or organization
        </p>
      </div>
      {filteredOrgs.map(o => (
        <button
          key={`org-${o.orgId}`}
          onClick={() => onSelectOrg(o)}
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-slate-50"
        >
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{o.orgName}</p>
            <p className="text-xs text-slate-400">Notifies all org members</p>
          </div>
        </button>
      ))}
      {filteredStaff.map(u => (
        <button
          key={`staff-${u.id}`}
          onClick={() => onSelectStaff(u)}
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {getInitials(u.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
            <p className="text-xs text-slate-400 capitalize truncate">{u.role.replace("_", " ")}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

/** Render message content with @mentions highlighted (only the @Name token, not the whole line) */
function renderContent(content: string, knownNames?: string[]) {
  if (knownNames && knownNames.length > 0) {
    const escaped = [...knownNames]
      .sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(@(?:${escaped.join("|")})(?=\\s|$)|@\\w+)`, "g");
    const parts = content.split(pattern);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return <span key={i} className="text-blue-200 font-semibold">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  }
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (/^@\w+$/.test(part)) {
      return <span key={i} className="text-blue-200 font-semibold">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Org Channel Row ──────────────────────────────────────────────────────────

function OrgChannelRow({ org, isActive, onClick }: {
  org: OrgItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const hasUnread = org.unreadCount > 0;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors hover:bg-slate-50 ${
        isActive ? "bg-blue-50 border-l-2 border-l-blue-500" : "border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
          isActive ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-600"
        }`}>
          {getInitials(org.orgName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-sm truncate ${hasUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
              {org.orgName}
            </span>
            <span className="text-[10px] text-slate-400 flex-shrink-0">
              {formatRelativeTime(org.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs truncate ${hasUnread ? "text-slate-700 font-medium" : "text-slate-400"}`}>
              {org.lastMessageContent
                ? (org.lastMessageSender
                  ? `${org.lastMessageSender.split(" ")[0]}: ${org.lastMessageContent}`
                  : org.lastMessageContent)
                : "No messages yet — start the conversation"}
            </p>
            {hasUnread && (
              <span className="flex-shrink-0 min-w-[18px] h-[18px] bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {org.unreadCount > 99 ? "99+" : org.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Org Chat Panel ───────────────────────────────────────────────────────────

function OrgChatPanel({ orgId, orgName, currentUserId }: {
  orgId: number;
  orgName: string;
  currentUserId: number;
}) {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [taskDialogMsg, setTaskDialogMsg] = useState<any | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load messages with polling
  const { data: messages = [], isLoading } = trpc.org.groupMessages.useQuery(
    { orgId, limit: 100 },
    { refetchInterval: 10_000, refetchIntervalInBackground: false },
  );

  // Load staff for @mention
  const { data: staffList = [] } = trpc.chat.staffList.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const staffListRef = useRef<StaffUser[]>([]);
  staffListRef.current = staffList as StaffUser[];

  // Load org list for @OrgName mention
  const { data: orgListRaw = [] } = trpc.org.list.useQuery({ includeInactive: false }, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const orgListRef = useRef<OrgItem[]>([]);
  orgListRef.current = (orgListRaw as any[]).map((o: any) => ({
    orgId: o.id,
    orgName: o.name,
    unreadCount: 0,
    lastMessageContent: null,
    lastMessageSender: null,
    lastMessageAt: null,
  }));

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark read when messages load
  const markReadMutation = trpc.org.markGroupRead.useMutation();
  useEffect(() => {
    if ((messages as any[]).length > 0) {
      const maxId = Math.max(...(messages as any[]).map((m: any) => m.id));
      markReadMutation.mutate({ orgId, lastMessageId: maxId });
    }
  }, [(messages as any[]).length, orgId]);

  const sendMsg = trpc.org.sendGroupMessage.useMutation({
    onSuccess: () => {
      utils.org.groupMessages.invalidate({ orgId });
      utils.org.allGroupsWithUnread.invalidate();
      setText("");
      setMentionQuery(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // @mention input handling
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart ?? val.length;
    const beforeCursor = val.slice(0, cursor);
    const atMatch = beforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const handleMentionSelectStaff = (staffUser: StaffUser) => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const beforeCursor = text.slice(0, cursor);
    const afterCursor = text.slice(cursor);
    const replaced = beforeCursor.replace(/@(\w[\w\s]*)$|@$/, `@${staffUser.name.trim()} `);
    setText(replaced + afterCursor);
    setMentionQuery(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleMentionSelectOrg = (org: OrgItem) => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const beforeCursor = text.slice(0, cursor);
    const afterCursor = text.slice(cursor);
    const replaced = beforeCursor.replace(/@(\w[\w\s]*)$|@$/, `@${org.orgName.trim()} `);
    setText(replaced + afterCursor);
    setMentionQuery(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content) return;

    // Extract mentioned user IDs by scanning text against staff list
    const mentionedUserIds = staffListRef.current
      .filter(u => content.includes(`@${u.name.trim()}`))
      .map(u => u.id);

    // Extract mentioned org IDs by scanning text against org list
    const mentionedOrgIds = orgListRef.current
      .filter(o => content.includes(`@${o.orgName.trim()}`))
      .map(o => o.orgId);

    sendMsg.mutate({ orgId, content, mentionedUserIds, mentionedOrgIds, replyToId: replyTarget?.id });
    setReplyTarget(null);
  }, [text, orgId, sendMsg]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header - WhatsApp teal */}
      <div className="px-5 py-3.5 bg-[#075E54] flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-semibold text-sm">
          {getInitials(orgName)}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{orgName}</h2>
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
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        )}
        {!isLoading && (messages as any[]).length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <MessageSquare className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">No messages yet. Start the conversation!</p>
          </div>
        )}
        {(messages as any[]).map((msg: any) => {
          const isMe = msg.senderId === currentUserId;
          const isFreshSelect = !msg.senderOrgName || msg.senderOrgName === "FreshSelect Meals";
          return (
            <div key={msg.id} className={`flex gap-2.5 group ${isMe ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm ${
                isMe ? "bg-[#075E54] text-white" : isFreshSelect ? "bg-[#128C7E] text-white" : "bg-blue-500 text-white"
              }`}>
                {getInitials(msg.senderName)}
              </div>
              <div className={`max-w-[70%] flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <div className="flex items-center gap-1.5 ml-1 mb-0.5">
                    <span className="text-xs font-semibold text-slate-700">{msg.senderName}</span>
                    {!isFreshSelect && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">{msg.senderOrgName}</span>
                    )}
                    {isFreshSelect && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">FreshSelect</span>
                    )}
                  </div>
                )}
                <div className={`relative rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                  isMe
                    ? "bg-[#DCF8C6] text-slate-800 rounded-tr-sm"
                    : "bg-white text-slate-800 rounded-tl-sm"
                }`}>
                  {msg.replyToId && msg.replyToSenderName && (
                    <ReplyQuote senderName={msg.replyToSenderName} content={msg.replyToContent ?? ""} />
                  )}
                  {renderContent(msg.content, [
                    ...staffListRef.current.map(u => u.name),
                    ...orgListRef.current.map(o => o.orgName),
                  ])}
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
        <div ref={inputWrapRef} className="relative flex items-end gap-2">
          {mentionQuery !== null && (
            <MentionDropdown
              query={mentionQuery}
              staffUsers={staffList as StaffUser[]}
              orgList={orgListRef.current}
              onSelectStaff={handleMentionSelectStaff}
              onSelectOrg={handleMentionSelectOrg}
              anchorRef={inputWrapRef}
            />
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 resize-none min-h-[44px] max-h-[120px] rounded-3xl border-0 bg-white shadow-sm text-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-emerald-400 transition-colors"
            rows={1}
            disabled={sendMsg.isPending}
          />
          <button
            onClick={handleSend}
            disabled={sendMsg.isPending || !text.trim()}
            className="flex-shrink-0 w-11 h-11 rounded-full bg-[#075E54] hover:bg-[#064e46] disabled:bg-slate-300 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shadow-sm mb-0.5"
            title="Send (Enter)"
          >
            {sendMsg.isPending ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <Send className="h-4.5 w-4.5" />
            )}
          </button>
        </div>
      </div>

      {/* Create Task from Message dialog — org group chat messages don't have a submissionId,
          so we use orgId as a stand-in and require the user to pick a client in the dialog */}
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminOrgChats() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);

  // Load all org group channels with unread counts
  const { data: orgChannels = [], isLoading } = trpc.org.allGroupsWithUnread.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return orgChannels as OrgItem[];
    const q = search.toLowerCase();
    return (orgChannels as OrgItem[]).filter((o: OrgItem) =>
      o.orgName?.toLowerCase().includes(q) ||
      o.lastMessageContent?.toLowerCase().includes(q)
    );
  }, [orgChannels, search]);

  const totalUnread = (orgChannels as OrgItem[]).reduce((sum: number, o: OrgItem) => sum + (o.unreadCount ?? 0), 0);
  const activeOrg = (orgChannels as OrgItem[]).find((o: OrgItem) => o.orgId === activeOrgId);

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-0px)] overflow-hidden">
        {/* ── Left panel: org channel list ──────────────────────────────── */}
        <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
          {/* Header */}
          <div className="px-4 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h1 className="text-base font-semibold text-slate-900">Org Group Chats</h1>
                {totalUnread > 0 && (
                  <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400">{(orgChannels as OrgItem[]).length} orgs</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search organizations..."
                className="pl-8 h-8 text-xs bg-slate-50 border-slate-200"
              />
            </div>
          </div>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                <p className="text-xs text-slate-400">Loading channels...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
                <Building2 className="h-8 w-8 text-slate-200" />
                <p className="text-sm text-slate-400">
                  {search ? "No channels match your search" : "No organizations yet"}
                </p>
              </div>
            ) : (
              filtered.map((org: OrgItem) => (
                <OrgChannelRow
                  key={org.orgId}
                  org={org}
                  isActive={activeOrgId === org.orgId}
                  onClick={() => setActiveOrgId(org.orgId)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-[10px] text-slate-400 text-center">
              One group channel per organization. Org staff and FreshSelect workers can all participate.
            </p>
          </div>
        </div>

        {/* ── Right panel: active org chat ──────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          {activeOrg ? (
            <OrgChatPanel
              orgId={activeOrg.orgId}
              orgName={activeOrg.orgName}
              currentUserId={user?.id ?? -1}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center">
                <Building2 className="h-12 w-12 text-blue-200" />
              </div>
              <div className="text-center max-w-sm">
                <h2 className="text-lg font-semibold text-slate-700 mb-2">Org Group Chat Inbox</h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Select an organization channel on the left to view and send messages. FreshSelect staff and org members can all participate in each org's group channel.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
                {[
                  { icon: Building2, label: "Per-org channels", desc: "One channel per org" },
                  { icon: MessageSquare, label: "Group chat", desc: "All members included" },
                  { icon: AtSign, label: "@mentions", desc: "Notify individuals or orgs" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
                    <Icon className="h-6 w-6 text-blue-400 mx-auto mb-2" />
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
