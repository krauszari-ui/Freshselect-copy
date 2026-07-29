/**
 * ReplyBar — shared component used in all chat areas.
 *
 * Shows a quoted preview of the message being replied to above the input box.
 * Renders a small ↩ reply button on hover over any message bubble.
 */
import { X, CornerUpLeft } from "lucide-react";

export interface ReplyTarget {
  id: number;
  senderName: string;
  content: string; // snippet (first 300 chars)
}

interface ReplyBarProps {
  replyTarget: ReplyTarget | null;
  onCancel: () => void;
}

/** Displayed above the chat input when a reply is in progress. */
export function ReplyBar({ replyTarget, onCancel }: ReplyBarProps) {
  if (!replyTarget) return null;
  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 border-t border-slate-200 rounded-t-md">
      <CornerUpLeft className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-600 truncate">
          Replying to {replyTarget.senderName}
        </p>
        <p className="text-xs text-slate-500 truncate">{replyTarget.content}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Cancel reply"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ReplyButtonProps {
  onClick: () => void;
}

/** Small ↩ button shown on hover over a message bubble. */
export function ReplyButton({ onClick }: ReplyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
      aria-label="Reply to this message"
      title="Reply"
    >
      <CornerUpLeft className="h-3.5 w-3.5" />
    </button>
  );
}

interface ReplyQuoteProps {
  senderName: string;
  content: string;
}

/** Inline quote shown inside a message bubble when it is a reply. */
export function ReplyQuote({ senderName, content }: ReplyQuoteProps) {
  return (
    <div className="mb-1.5 px-2 py-1 bg-white/40 border-l-2 border-slate-400 rounded text-xs text-slate-600 max-w-full overflow-hidden">
      <span className="font-semibold">{senderName}: </span>
      <span className="truncate">{content}</span>
    </div>
  );
}
