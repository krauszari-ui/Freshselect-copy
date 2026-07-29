/**
 * ClientChatTab — Professional per-client staff chat thread.
 * WhatsApp/Teams-style bubble UI with real-time polling, file attachments,
 * emoji reactions, message deletion, read receipts, @mention autocomplete,
 * mention notifications, and PDF export.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Smile, Trash2, Download, FileText,
  MessageSquare, Loader2, X, CheckCheck, FileDown, AtSign, ClipboardList,
} from "lucide-react";
import { ReplyBar, ReplyButton, ReplyQuote, type ReplyTarget } from "@/components/ReplyBar";
import { CreateTaskFromMessageDialog } from "@/components/CreateTaskFromMessageDialog";
import { toast } from "sonner";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number;
  submissionId: number;
  senderId: number;
  senderName: string;
  senderRole: string;
  content: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  reactions?: unknown;
  isDeleted: number;
  createdAt: Date | string;
  replyToId?: number | null;
  replyToSenderName?: string | null;
  replyToContent?: string | null;
}

interface StaffUser {
  id: number;
  name: string;
  role: string;
  email: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "✅"];

function toWinAnsi(str: string): string {
  return str
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF]/g, (c) => {
      const map: Record<string, string> = {
        "\u00e9": "e", "\u00e8": "e", "\u00ea": "e", "\u00eb": "e",
        "\u00e0": "a", "\u00e2": "a", "\u00e4": "a", "\u00e1": "a",
        "\u00f3": "o", "\u00f4": "o", "\u00f6": "o", "\u00fa": "u",
        "\u00fc": "u", "\u00f1": "n", "\u00e7": "c", "\u00ed": "i",
        "\u00ef": "i", "\u00c9": "E", "\u00c0": "A", "\u00c7": "C",
        "\u00d1": "N",
      };
      return map[c] ?? "?";
    });
}

function formatTime(date: Date | string) {
  const d = new Date(date);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateSeparator(date: Date | string) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function getRoleColor(role: string) {
  switch (role) {
    case "super_admin": return "bg-purple-500";
    case "admin": return "bg-blue-500";
    case "worker": return "bg-emerald-500";
    case "assessor": return "bg-amber-500";
    default: return "bg-slate-400";
  }
}

function getRoleBadge(role: string) {
  switch (role) {
    case "super_admin": return "Super Admin";
    case "admin": return "Admin";
    case "worker": return "Worker";
    case "assessor": return "Assessor";
    default: return role;
  }
}

function getInitials(name: string) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function isImageType(type?: string | null) {
  return type?.startsWith("image/");
}

/** Render message content with @mentions highlighted */
function renderContent(content: string, knownNames?: string[]) {
  // Build a regex that matches @KnownName or @KnownFirst KnownLast from the staff list,
  // falling back to @Word (no spaces) for unknown mentions.
  // This prevents greedy space-matching from turning the whole message blue.
  if (knownNames && knownNames.length > 0) {
    // Sort longest first so "@Mrs Smith" matches before "@Mrs"
    const escaped = [...knownNames]
      .sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(@(?:${escaped.join("|")})(?=\\s|$)|@\\w+)`, "g");
    const parts = content.split(pattern);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return <span key={i} className="text-blue-300 font-semibold">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  }
  // Fallback: only match @SingleWord (no spaces) to avoid greedy highlight
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (/^@\w+$/.test(part)) {
      return <span key={i} className="text-blue-300 font-semibold">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

async function exportChatToPdf(messages: Message[], clientName: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 50;
  const LINE_H = 16;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    // Footer on new page
    page.drawText(toWinAnsi("FreshSelect Meals SCN - Confidential"), {
      x: MARGIN, y: 25, size: 8, font, color: rgb(0.6, 0.6, 0.6),
    });
    page.drawText(`Page ${doc.getPageCount()}`, {
      x: PAGE_W - MARGIN - 30, y: 25, size: 8, font, color: rgb(0.6, 0.6, 0.6),
    });
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < 60) newPage();
  };

  const drawText = (text: string, opts: { x?: number; size?: number; useBold?: boolean; color?: ReturnType<typeof rgb> }) => {
    const { x = MARGIN, size = 10, useBold = false, color = rgb(0.1, 0.1, 0.1) } = opts;
    const safe = toWinAnsi(text);
    const f = useBold ? boldFont : font;
    // Word-wrap
    const words = safe.split(" ");
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const w = f.widthOfTextAtSize(test, size);
      if (w > CONTENT_W - (x - MARGIN)) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    for (const l of lines) {
      ensureSpace(LINE_H);
      page.drawText(l, { x, y, size, font: f, color });
      y -= LINE_H;
    }
    return lines.length;
  };

  // ── Header ─────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: MARGIN, y: y - 40, width: CONTENT_W, height: 50, color: rgb(0.06, 0.73, 0.45) });
  page.drawText("FreshSelect Meals SCN", { x: MARGIN + 12, y: y - 10, size: 14, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(toWinAnsi(`Chat Thread: ${clientName}`), { x: MARGIN + 12, y: y - 28, size: 10, font, color: rgb(0.9, 1, 0.95) });
  y -= 60;

  const now = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  page.drawText(toWinAnsi(`Exported: ${now}  |  ${messages.filter(m => !m.isDeleted).length} messages`), {
    x: MARGIN, y, size: 8, font, color: rgb(0.5, 0.5, 0.5),
  });
  y -= 24;

  // Footer on first page
  page.drawText(toWinAnsi("FreshSelect Meals SCN - Confidential"), {
    x: MARGIN, y: 25, size: 8, font, color: rgb(0.6, 0.6, 0.6),
  });
  page.drawText("Page 1", { x: PAGE_W - MARGIN - 30, y: 25, size: 8, font, color: rgb(0.6, 0.6, 0.6) });

  // ── Messages ───────────────────────────────────────────────────────────────
  let lastDate = "";

  for (const msg of messages) {
    if (msg.isDeleted) continue;

    const msgDate = new Date(msg.createdAt).toDateString();
    if (msgDate !== lastDate) {
      lastDate = msgDate;
      ensureSpace(28);
      y -= 6;
      const sep = formatDateSeparator(msg.createdAt);
      page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
      const sepW = boldFont.widthOfTextAtSize(toWinAnsi(sep), 8);
      page.drawText(toWinAnsi(sep), { x: PAGE_W / 2 - sepW / 2, y, size: 8, font: boldFont, color: rgb(0.55, 0.55, 0.55) });
      y -= 18;
    }

    ensureSpace(50);

    // Sender line
    const timeStr = formatTime(msg.createdAt);
    const senderLine = toWinAnsi(`${msg.senderName}  [${getRoleBadge(msg.senderRole)}]  ${timeStr}`);
    page.drawText(senderLine, { x: MARGIN, y, size: 8, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;

    // Content
    if (msg.content) {
      drawText(msg.content, { size: 10 });
    }

    // Attachment note
    if (msg.attachmentName) {
      ensureSpace(LINE_H);
      page.drawText(toWinAnsi(`[Attachment: ${msg.attachmentName}]`), {
        x: MARGIN, y, size: 9, font, color: rgb(0.3, 0.5, 0.8),
      });
      y -= LINE_H;
    }

    y -= 8;
  }

  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = toWinAnsi(`freshselect-chat-${clientName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, role, size = "md" }: { name: string; role: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} rounded-full ${getRoleColor(role)} flex items-center justify-center text-white font-semibold flex-shrink-0 select-none`}>
      {getInitials(name)}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isMine,
  currentUserId,
  readWatermarks = {},
  totalParticipants = 0,
  staffNames = [],
  onDelete,
  onReact,
  onOpenAttachment,
  onReply,
  onCreateTask,
}: {
  msg: Message;
  isMine: boolean;
  currentUserId: number;
  readWatermarks?: Record<number, number>;
  totalParticipants?: number;
  staffNames?: string[];
  onDelete: (id: number) => void;
  onReact: (id: number, emoji: string) => void;
  onOpenAttachment: (url: string, name: string) => void;
  onReply: (target: ReplyTarget) => void;
  onCreateTask: (msg: Message) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const reactionCounts = useMemo(() => {
    const map: Record<string, { count: number; mine: boolean }> = {};
    for (const r of (msg.reactions as Array<{ userId: number; emoji: string }> | null) ?? []) {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false };
      map[r.emoji].count++;
      if (r.userId === currentUserId) map[r.emoji].mine = true;
    }
    return map;
  }, [msg.reactions, currentUserId]);

  if (msg.isDeleted) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1`}>
        <span className="text-xs text-slate-400 italic px-3 py-1.5 bg-slate-100 rounded-full">
          Message deleted
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-2.5 mb-3 group ${isMine ? "flex-row-reverse" : "flex-row"}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
    >
      {!isMine && <Avatar name={msg.senderName} role={msg.senderRole} />}

      <div className={`flex flex-col max-w-[72%] ${isMine ? "items-end" : "items-start"}`}>
        {!isMine && (
          <div className="flex items-center gap-1.5 mb-1 ml-1">
            <span className="text-xs font-semibold text-slate-700">{msg.senderName}</span>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
              {getRoleBadge(msg.senderRole)}
            </span>
          </div>
        )}

        <div className="relative">
          <div
            className={`rounded-2xl px-4 py-2.5 shadow-sm ${
              isMine
                ? "bg-emerald-500 text-white rounded-tr-sm"
                : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
            }`}
          >
            {msg.replyToId && msg.replyToSenderName && (
              <ReplyQuote senderName={msg.replyToSenderName} content={msg.replyToContent ?? ""} />
            )}
            {msg.attachmentUrl && (
              <div className="mb-2">
                {isImageType(msg.attachmentType) ? (
                  <img
                    src={msg.attachmentUrl}
                    alt={msg.attachmentName ?? "attachment"}
                    className="max-w-[240px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => onOpenAttachment(msg.attachmentUrl!, msg.attachmentName ?? "image")}
                  />
                ) : (
                  <button
                    onClick={() => onOpenAttachment(msg.attachmentUrl!, msg.attachmentName ?? "file")}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isMine ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate max-w-[180px]">{msg.attachmentName ?? "File"}</span>
                    <Download className="h-3.5 w-3.5 flex-shrink-0" />
                  </button>
                )}
              </div>
            )}

            {msg.content && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                {renderContent(msg.content, staffNames)}
              </p>
            )}

            <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
              <span className={`text-[10px] ${isMine ? "text-emerald-100" : "text-slate-400"}`}>
                {formatTime(msg.createdAt)}
              </span>
              {isMine && (() => {
                // Count how many OTHER participants have read this message
                const othersWhoRead = Object.entries(readWatermarks)
                  .filter(([uid, lastRead]) => Number(uid) !== currentUserId && lastRead >= msg.id)
                  .length;
                const otherCount = Math.max(0, totalParticipants - 1); // exclude self
                const allRead = otherCount > 0 && othersWhoRead >= otherCount;
                return (
                  <CheckCheck
                    className={`h-3.5 w-3.5 transition-colors ${
                      allRead ? "text-blue-300" : "text-emerald-200"
                    }`}
                    aria-label={allRead ? "Seen by all" : "Delivered"}
                  />
                );
              })()}
            </div>
          </div>

          {Object.keys(reactionCounts).length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
              {Object.entries(reactionCounts).map(([emoji, { count, mine }]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(msg.id, emoji)}
                  className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    mine ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>{emoji}</span>
                  {count > 1 && <span className="font-medium">{count}</span>}
                </button>
              ))}
            </div>
          )}

          {showActions && (
            <div className={`absolute top-0 ${isMine ? "right-full mr-2" : "left-full ml-2"} flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2 py-1 shadow-md z-10`}>
              <ReplyButton onClick={() => onReply({ id: msg.id, senderName: msg.senderName, content: (msg.attachmentName ? `[${msg.attachmentName}]` : msg.content).slice(0, 300) })} />
              <button
                onClick={() => onCreateTask(msg)}
                className="p-1 rounded-full hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-colors"
                title="Create task from this message"
              >
                <ClipboardList className="h-3.5 w-3.5" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker(p => !p)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                  title="React"
                >
                  <Smile className="h-3.5 w-3.5" />
                </button>
                {showEmojiPicker && (
                  <div className={`absolute bottom-full mb-1 ${isMine ? "right-0" : "left-0"} flex gap-1 bg-white border border-slate-200 rounded-full px-2 py-1.5 shadow-lg z-20`}>
                    {EMOJI_REACTIONS.map(e => (
                      <button
                        key={e}
                        onClick={() => { onReact(msg.id, e); setShowEmojiPicker(false); }}
                        className="text-base hover:scale-125 transition-transform"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {isMine && (
                <button
                  onClick={() => onDelete(msg.id)}
                  className="p-1 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Date Separator ───────────────────────────────────────────────────────────

function DateSeparator({ date }: { date: Date | string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs text-slate-400 font-medium px-2">{formatDateSeparator(date)}</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

// ─── @Mention Dropdown ────────────────────────────────────────────────────────

function MentionDropdown({
  query,
  users,
  onSelect,
  anchorRef,
}: {
  query: string;
  users: StaffUser[];
  onSelect: (user: StaffUser) => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(query.toLowerCase()) ||
    u.email.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 6);

  if (!filtered.length) return null;

  return (
    <div className="absolute bottom-full mb-2 left-0 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
          <AtSign className="h-3 w-3" /> Mention a team member
        </p>
      </div>
      {filtered.map(u => (
        <button
          key={u.id}
          onClick={() => onSelect(u)}
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
        >
          <div className={`w-8 h-8 rounded-full ${getRoleColor(u.role)} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>
            {getInitials(u.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
            <p className="text-xs text-slate-400 truncate">{getRoleBadge(u.role)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ClientChatTab({ submissionId, clientName }: { submissionId: number; clientName: string }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastSeenId, setLastSeenId] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);

  // Create Task from Message dialog state
  const [taskDialogMsg, setTaskDialogMsg] = useState<Message | null>(null);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionedUsers, setMentionedUsers] = useState<StaffUser[]>([]);
  // Ref to avoid stale closure in handleSend
  const mentionedUsersRef = useRef<StaffUser[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  // ── Load messages ──────────────────────────────────────────────────────────
  const { data: messages = [], isLoading, refetch } = trpc.chat.list.useQuery(
    { submissionId, limit: 50 },
    { refetchOnWindowFocus: false, staleTime: 0 }
  );

  // ── Load staff for @mention ────────────────────────────────────────────────
  const { data: staffList = [] } = trpc.chat.staffList.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  // Keep a ref so handleSend always reads the latest staffList without stale closure
  const staffListRef = useRef<StaffUser[]>([]);
  staffListRef.current = staffList;

  // ── Read watermarks (for ✓✓ read receipts) ─────────────────────────────────
  const { data: readWatermarks = {} } = trpc.chat.readWatermarks.useQuery(
    { submissionId },
    { refetchInterval: 15_000, refetchIntervalInBackground: false, staleTime: 5_000 }
  );

  // ── Real-time polling (every 10 seconds) ─────────────────────────────────────
  const { data: newMessages = [] } = trpc.chat.poll.useQuery(
    { submissionId, afterId: lastSeenId },
    { refetchInterval: 10_000, refetchIntervalInBackground: false, enabled: lastSeenId > 0, refetchOnWindowFocus: true }
  );

  // Merge: base messages + polled new messages + optimistic (sent but not yet in base)
  const allMessages = useMemo(() => {
    const baseIds = new Set(messages.map((m: Message) => m.id));
    const freshPolled = newMessages.filter((m: Message) => !baseIds.has(m.id));
    const merged = [...messages, ...freshPolled];
    const mergedIds = new Set(merged.map((m: Message) => m.id));
    // Keep optimistic messages that haven't been confirmed yet (id < 0 = temp)
    const stillPending = optimisticMessages.filter((m: Message) => m.id < 0 || !mergedIds.has(m.id));
    return [...merged, ...stillPending];
  }, [messages, newMessages, optimisticMessages]);

  useEffect(() => {
    if (allMessages.length > 0) {
      const maxId = Math.max(...allMessages.map((m: Message) => m.id));
      setLastSeenId(maxId);
    }
  }, [allMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  const markReadMutation = trpc.chat.markRead.useMutation();
  useEffect(() => {
    if (allMessages.length > 0) {
      const maxId = Math.max(...allMessages.map((m: Message) => m.id));
      markReadMutation.mutate({ submissionId, lastReadMessageId: maxId });
    }
  }, [allMessages.length, submissionId]);

  // ── @mention input handling ────────────────────────────────────────────────
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Detect @mention trigger: find the last @ before cursor.
    // Only match @word-chars-no-spaces so the dropdown closes when user types a space.
    const cursor = e.target.selectionStart ?? val.length;
    const beforeCursor = val.slice(0, cursor);
    const atMatch = beforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const handleMentionSelect = (staffUser: StaffUser) => {
    // Replace the @query with @Name in the text
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const beforeCursor = text.slice(0, cursor);
    const afterCursor = text.slice(cursor);
    const replaced = beforeCursor.replace(/@(\w[\w\s]*)$|@$/, `@${staffUser.name.trim()} `);
    setText(replaced + afterCursor);
    setMentionQuery(null);
    // Track mentioned users (deduplicated)
    setMentionedUsers(prev => {
      const next = prev.find(u => u.id === staffUser.id) ? prev : [...prev, staffUser];
      mentionedUsersRef.current = next;
      return next;
    });
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: () => {
      utils.chat.list.invalidate({ submissionId });
      utils.chat.allUnreadCounts.invalidate();
      utils.chat.inbox.invalidate();
    },
    onError: (err) => toast.error(err.message ?? "Failed to send message"),
  });

  const uploadAttachmentMutation = trpc.chat.uploadAttachment.useMutation({
    onError: (err) => toast.error(err.message ?? "Failed to upload file"),
  });

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content && !attachFile) return;
    setSending(true);
    try {
      let attachmentUrl: string | undefined;
      let attachmentName: string | undefined;
      let attachmentType: string | undefined;

      if (attachFile) {
        setUploading(true);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(attachFile);
        });
        const uploaded = await uploadAttachmentMutation.mutateAsync({
          submissionId,
          fileName: attachFile.name,
          fileData: base64,
          contentType: attachFile.type,
        });
        attachmentUrl = uploaded.url;
        attachmentName = uploaded.fileName;
        attachmentType = uploaded.contentType;
        setUploading(false);
      }

      // Extract mentioned user IDs by scanning the message text against the full staff list
      // Use ref to avoid stale closure issues with staffList
      const mentionedInText = staffListRef.current.filter(u => content.includes(`@${u.name.trim()}`));

      // Add optimistic message immediately so it doesn't disappear while waiting
      const tempId = -(Date.now());
      const optimistic: Message = {
        id: tempId,
        submissionId,
        senderId: user?.id ?? 0,
        senderName: user?.name ?? user?.email ?? "You",
        senderRole: user?.role ?? "worker",
        content: content || "",
        createdAt: new Date(),
        attachmentUrl: attachmentUrl ?? null,
        attachmentName: attachmentName ?? null,
        attachmentType: attachmentType ?? null,
        isDeleted: 0,
        reactions: [],
        replyToId: replyTarget?.id ?? null,
        replyToSenderName: replyTarget?.senderName ?? null,
        replyToContent: replyTarget?.content ?? null,
      };
      setOptimisticMessages(prev => [...prev, optimistic]);

      setText("");
      setAttachFile(null);
      setAttachPreview(null);
      setMentionedUsers([]);
      mentionedUsersRef.current = [];
      setMentionQuery(null);
      setReplyTarget(null);
      textareaRef.current?.focus();

      await sendMutation.mutateAsync({
        submissionId,
        content: content || "",
        attachmentUrl,
        attachmentName,
        attachmentType,
        mentionedUserIds: mentionedInText.map(u => u.id),
        replyToId: replyTarget?.id,
      });

      // Clear optimistic after server confirms and refetch brings real message
      await refetch();
      setOptimisticMessages([]);
    } catch {
      // errors handled in mutation callbacks
    } finally {
      setSending(false);
      setUploading(false);
    }
  }, [text, attachFile, submissionId, sendMutation, uploadAttachmentMutation, refetch]);

  // ── Delete message ────────────────────────────────────────────────────────
  const deleteMutation = trpc.chat.delete.useMutation({
    onSuccess: () => utils.chat.list.invalidate({ submissionId }),
    onError: (err) => toast.error(err.message ?? "Failed to delete message"),
  });

  // ── React to message ──────────────────────────────────────────────────────
  const reactMutation = trpc.chat.react.useMutation({
    onSuccess: () => utils.chat.list.invalidate({ submissionId }),
    onError: (err) => toast.error(err.message ?? "Failed to add reaction"),
  });

  // ── File attachment ───────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error("File must be under 16 MB"); return; }
    setAttachFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setAttachPreview(url);
    } else {
      setAttachPreview(null);
    }
  };

  // ── Keyboard shortcut ─────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setMentionQuery(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Open attachment ───────────────────────────────────────────────────────
  const handleOpenAttachment = (url: string, _name: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ── PDF Export ────────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (allMessages.length === 0) { toast.error("No messages to export"); return; }
    setExportingPdf(true);
    try {
      await exportChatToPdf(allMessages as Message[], clientName);
      toast.success("Chat exported as PDF");
    } catch (err: any) {
      toast.error(`PDF export failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Group messages by date ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const result: Array<{ type: "separator"; date: Date } | { type: "message"; msg: Message }> = [];
    let lastDate = "";
    for (const msg of allMessages as Message[]) {
      const d = new Date(msg.createdAt).toDateString();
      if (d !== lastDate) {
        result.push({ type: "separator", date: new Date(msg.createdAt) });
        lastDate = d;
      }
      result.push({ type: "message", msg });
    }
    return result;
  }, [allMessages]);

  const canSend = user?.role !== "viewer";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[500px] rounded-xl overflow-hidden shadow-md border border-slate-200">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-[#075E54] text-white">
        <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center">
          <MessageSquare className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Team Chat — {clientName}</h2>
          <p className="text-xs text-emerald-200 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            Staff-only thread
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(user?.role === "admin" || user?.role === "super_admin") && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exportingPdf || allMessages.length === 0}
              className="flex items-center gap-1.5 text-xs h-7 px-2.5 border-emerald-400 text-white hover:bg-emerald-700 bg-transparent"
              title="Download chat as PDF"
            >
              {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              {exportingPdf ? "Exporting..." : "Export PDF"}
            </Button>
          )}
        </div>
      </div>

      {/* Messages area - WhatsApp-style wallpaper */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{
          backgroundColor: "#ECE5DD",
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8b8a2' fill-opacity='0.18'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            <p className="text-sm text-slate-400">Loading messages...</p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <MessageSquare className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600">No messages yet</p>
              <p className="text-xs text-slate-400 mt-1">Start the conversation about {clientName}</p>
            </div>
          </div>
        ) : (
          <>
            {grouped.map((item, idx) =>
              item.type === "separator" ? (
                <DateSeparator key={`sep-${idx}`} date={item.date} />
              ) : (
                <MessageBubble
                  key={item.msg.id}
                  msg={item.msg}
                  isMine={item.msg.senderId === user?.id}
                  currentUserId={user?.id ?? 0}
                  readWatermarks={readWatermarks as Record<number, number>}
                  totalParticipants={Object.keys(readWatermarks).length}
                  staffNames={staffListRef.current.map(u => u.name)}
                  onDelete={(id) => deleteMutation.mutate({ messageId: id, submissionId })}
                  onReact={(id, emoji) => reactMutation.mutate({ messageId: id, submissionId, emoji })}
                  onOpenAttachment={handleOpenAttachment}
                  onReply={setReplyTarget}
                  onCreateTask={(msg) => setTaskDialogMsg(msg)}
                />
              )
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Attachment preview */}
      {attachFile && (
        <div className="px-4 py-2 border-t border-slate-100 bg-white">
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
            {attachPreview ? (
              <img src={attachPreview} alt="preview" className="w-10 h-10 rounded object-cover" />
            ) : (
              <div className="w-10 h-10 rounded bg-slate-200 flex items-center justify-center">
                <FileText className="h-5 w-5 text-slate-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{attachFile.name}</p>
              <p className="text-xs text-slate-400">{(attachFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={() => { setAttachFile(null); setAttachPreview(null); }}
              className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Input area - WhatsApp style */}
      {canSend ? (
        <div className="px-3 py-2.5 bg-[#F0F0F0] border-t border-[#d9d9d9]">
          <ReplyBar replyTarget={replyTarget} onCancel={() => setReplyTarget(null)} />
          <div ref={inputWrapRef} className="flex items-end gap-2 relative">
            {/* @mention dropdown */}
            {mentionQuery !== null && (
              <MentionDropdown
                query={mentionQuery}
                users={staffList as StaffUser[]}
                onSelect={handleMentionSelect}
                anchorRef={inputWrapRef}
              />
            )}

            {/* File attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 p-2.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors mb-0.5"
              title="Attach file"
              disabled={sending}
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />

            {/* Text input */}
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="resize-none min-h-[44px] max-h-[120px] rounded-3xl border-0 bg-white shadow-sm text-sm px-4 py-3 transition-colors focus-visible:ring-1 focus-visible:ring-emerald-400"
                rows={1}
                disabled={sending}
              />
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={sending || uploading || (!text.trim() && !attachFile)}
              className="flex-shrink-0 w-11 h-11 rounded-full bg-[#075E54] hover:bg-[#064e46] disabled:bg-slate-300 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shadow-sm mb-0.5"
              title="Send (Enter)"
            >
              {sending || uploading ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
              ) : (
                <Send className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 bg-[#F0F0F0] border-t border-[#d9d9d9] text-center">
          <p className="text-xs text-slate-500">Viewers cannot send messages</p>
        </div>
      )}

      {/* Create Task from Message dialog */}
      {taskDialogMsg && (
        <CreateTaskFromMessageDialog
          open={!!taskDialogMsg}
          onClose={() => setTaskDialogMsg(null)}
          messageContent={taskDialogMsg.content}
          messageId={taskDialogMsg.id}
          messageType="client"
          submissionId={submissionId}
          clientName={clientName}
          onCreated={() => {
            utils.admin.tasks.byClient.invalidate({ submissionId });
            utils.admin.tasks.byClientWithDetails.invalidate({ submissionId });
          }}
        />
      )}
    </div>
  );
}
