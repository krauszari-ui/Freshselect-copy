/**
 * OrgNotifications — Standalone notifications page for org staff.
 * Does NOT use AdminLayout (which would redirect org staff back to /org).
 * Accessible at /org/notifications.
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Bell, CheckCheck, Mail, MessageSquare, UserPlus, ClipboardList, ChevronRight, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  inbound_email:  { icon: Mail,           color: "bg-blue-100 text-blue-600",   label: "Email Reply"       },
  referrer_reply: { icon: MessageSquare,  color: "bg-purple-100 text-purple-600", label: "Referrer Message" },
  new_submission: { icon: UserPlus,       color: "bg-green-100 text-green-600",  label: "New Application"  },
  task_update:    { icon: ClipboardList,  color: "bg-orange-100 text-orange-600", label: "Task Update"     },
  org_referral:   { icon: UserPlus,       color: "bg-teal-100 text-teal-600",    label: "Org Referral"    },
  chat_mention:   { icon: MessageSquare,  color: "bg-indigo-100 text-indigo-600", label: "Mention"         },
};

function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function OrgNotifications() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Auth guard
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

  const { data: notifications, isLoading } = trpc.notifications.list.useQuery({ limit: 100 });
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.unreadCount.invalidate(),
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const unreadCount = notifications?.filter((n) => !n.isReadByUser).length ?? 0;

  function handleClick(n: { id: number; isReadByUser: boolean; link?: string | null }) {
    if (!n.isReadByUser) {
      markRead.mutate({ id: n.id });
    }
    // For org staff, redirect org-specific links to /org context
    if (n.link) {
      // If the link points to an admin client page, redirect to org client page
      const orgLink = n.link.replace(/^\/admin\/clients\//, "/org/clients/");
      navigate(orgLink);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/org")} className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="ml-auto flex items-center gap-1.5 text-slate-600"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No notifications yet</p>
            <p className="text-sm mt-1">Org referrals, mentions, and task updates will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const cfg = TYPE_CONFIG[n.type] ?? { icon: Bell, color: "bg-slate-100 text-slate-500", label: n.type };
              const Icon = cfg.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-all hover:shadow-sm ${
                    n.isReadByUser
                      ? "bg-white border-slate-100 opacity-70 hover:opacity-100"
                      : "bg-white border-primary/30 shadow-sm"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${n.isReadByUser ? "text-slate-400" : "text-primary"}`}>
                        {cfg.label}
                      </span>
                      {!n.isReadByUser && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className={`text-sm font-medium truncate ${n.isReadByUser ? "text-slate-500" : "text-slate-900"}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {n.link && (
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
