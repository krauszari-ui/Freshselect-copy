import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Users, ClipboardList, FileText, Building2,
  LogOut, Loader2, ShieldCheck, ChevronRight, Leaf, Link2, UserCog, AlertTriangle, BarChart3, Bell, ScrollText, Menu, X, Mail, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ReactNode, useState, useEffect } from "react";
import InactivityGuard from "@/components/InactivityGuard";
import { trpc } from "@/lib/trpc";

const NAV_ITEMS = [
  { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/agency", label: "Agency Overview", icon: Building2 },
  { path: "/admin/clients", label: "Clients", icon: Users },
  { path: "/admin/tasks", label: "Tasks", icon: ClipboardList },
  { path: "/admin/documents", label: "Document Library", icon: FileText },
  { path: "/admin/referrals", label: "Referral Links", icon: Link2 },
];

const ADMIN_ONLY_NAV_ITEMS = [
  { path: "/admin/workers", label: "Staff Management", icon: UserCog },
  { path: "/admin/organizations", label: "Organizations", icon: Building2 },
  { path: "/admin/duplicates", label: "Duplicate Scan", icon: AlertTriangle },
  { path: "/admin/assessment-report", label: "Assessment Report", icon: BarChart3 },
  { path: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
];
const SUPER_ADMIN_ONLY_NAV_ITEMS = [
  { path: "/admin/email-blast", label: "Email Blast", icon: Mail },
];

// ─── Sidebar content as a proper named component (NOT defined inside render) ──
interface SidebarContentProps {
  navItems: { path: string; label: string; icon: React.ElementType }[];
  location: string;
  user: { name?: string | null; role: string } | null;
  unreadCount: number;
  chatUnreadCount: number;
  onClose: () => void;
  onLogout: () => void;
}

function SidebarContent({ navItems, location, user, unreadCount, chatUnreadCount, onClose, onLogout }: SidebarContentProps) {
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <>
      {/* Logo */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shrink-0">
          <Leaf className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-sm leading-tight">FreshSelect</h1>
          <p className="text-[10px] text-green-300">Social Care Network</p>
        </div>
        {/* Close button on mobile */}
        <button
          className="ml-auto md:hidden p-1 rounded-lg text-green-300 hover:text-white hover:bg-green-800"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = location === item.path || (item.path !== "/admin/dashboard" && location.startsWith(item.path));
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <button
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-green-600 text-white font-medium"
                    : "text-green-200 hover:text-white hover:bg-green-800"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span>{item.label}</span>
                </div>
                {active && <ChevronRight className="h-4 w-4 opacity-60" />}
              </button>
            </Link>
          );
        })}

        {/* Org Group Chats */}
        <Link href="/admin/org-chats">
          <button
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
              location === "/admin/org-chats" || location.startsWith("/admin/org-chats")
                ? "bg-green-600 text-white font-medium"
                : "text-green-200 hover:text-white hover:bg-green-800"
            }`}
          >
            <div className="flex items-center gap-3">
              <Building2 className="h-[18px] w-[18px] shrink-0" />
              <span>Org Group Chats</span>
            </div>
            {(location === "/admin/org-chats" || location.startsWith("/admin/org-chats")) && (
              <ChevronRight className="h-4 w-4 opacity-60" />
            )}
          </button>
        </Link>

        {/* Chat Inbox */}
        <Link href="/admin/chat">
          <button
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
              location === "/admin/chat" || location.startsWith("/admin/chat")
                ? "bg-green-600 text-white font-medium"
                : "text-green-200 hover:text-white hover:bg-green-800"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <MessageSquare className="h-[18px] w-[18px] shrink-0" />
                {chatUnreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                  </span>
                )}
              </div>
              <span>Team Chat</span>
            </div>
            {location === "/admin/chat" || location.startsWith("/admin/chat")
              ? <ChevronRight className="h-4 w-4 opacity-60" />
              : chatUnreadCount > 0
                ? <span className="bg-emerald-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</span>
                : null}
          </button>
        </Link>

        {/* Notifications bell — hidden for assessor role */}
        {user?.role !== "assessor" && (
          <Link href="/admin/notifications">
            <button
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                location === "/admin/notifications"
                  ? "bg-green-600 text-white font-medium"
                  : "text-green-200 hover:text-white hover:bg-green-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Bell className="h-[18px] w-[18px] shrink-0" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
                <span>Notifications</span>
              </div>
              {location === "/admin/notifications"
                ? <ChevronRight className="h-4 w-4 opacity-60" />
                : unreadCount > 0
                  ? <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">{unreadCount > 99 ? "99+" : unreadCount}</span>
                  : null}
            </button>
          </Link>
        )}
      </nav>

      {/* User section at bottom */}
      <div className="p-3 border-t border-green-700">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-8 rounded-full bg-green-600 flex items-center justify-center text-white font-medium text-xs shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{user?.name || "Admin"}</p>
            <p className="text-[10px] text-green-300 truncate">FreshSelect Meals</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-green-300 hover:text-red-300 hover:bg-green-800 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile nav)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  // Close sidebar on desktop resize
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 768) setSidebarOpen(false);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  // Redirect assessors and org staff to their own portals
  // window.location.replace avoids React error #300 that occurs when
  // navigate() fires while the component tree is mid-render
  useEffect(() => {
    if (!loading && user) {
      const orgId = (user as any).orgId;
      if (orgId) {
        window.location.replace("/org");
      } else if (user.role === "assessor") {
        window.location.replace("/assessor");
      }
    }
  }, [loading, user]);

  // Poll unread notification count every 30 seconds
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
    enabled: !!user && user.role !== "assessor",
  });
  const unreadCount = unreadData?.count ?? 0;

  // Poll chat unread count every 15 seconds (only when tab is focused)
  const { data: chatUnreadData } = trpc.chat.allUnreadCounts.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    enabled: !!user,
  });
  const chatUnreadCount = chatUnreadData
    ? Object.values(chatUnreadData as Record<string, number>).reduce((sum, n) => sum + (n ?? 0), 0)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-900">
        <Loader2 className="h-8 w-8 animate-spin text-green-300" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    window.location.href = getLoginUrl();
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-900">
        <Loader2 className="h-8 w-8 animate-spin text-green-300" />
      </div>
    );
  }

  // Assessors and org staff: show a spinner while window.location.replace fires
  // Never return null from a component — React error #300
  if (user.role === "assessor" || (user as any).orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-900">
        <Loader2 className="h-8 w-8 animate-spin text-green-300" />
      </div>
    );
  }

  const staffRoles = ["super_admin", "admin", "worker", "viewer", "assessor"];
  if (!staffRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-900 text-white">
        <div className="text-center space-y-4">
          <ShieldCheck className="h-16 w-16 mx-auto text-red-400" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-green-200">You do not have permission to access the admin panel.</p>
          <Link href="/">
            <Button variant="outline" className="border-green-400 text-green-100 hover:bg-green-800">
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const allNavItems = [
    ...NAV_ITEMS.filter((item) => {
      if (item.path === "/admin/referrals" && user.role === "worker") {
        const perms = (user.permissions as any) || {};
        return perms.showReferralLinks !== false;
      }
      return true;
    }),
    ...(["super_admin", "admin"].includes(user.role) ? ADMIN_ONLY_NAV_ITEMS : []),
    ...(user.role === "super_admin" ? SUPER_ADMIN_ONLY_NAV_ITEMS : []),
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Mobile overlay — blocks interaction with content behind sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — desktop: always visible; mobile: slide-in drawer */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-40
          w-64 bg-green-900 text-white flex flex-col shrink-0
          md:sticky md:top-0 md:h-screen
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <SidebarContent
          navItems={allNavItems}
          location={location}
          user={user}
          unreadCount={unreadCount}
          chatUnreadCount={chatUnreadCount}
          onClose={() => setSidebarOpen(false)}
          onLogout={() => logout()}
        />
      </aside>

      {/* Main content */}
      <main id="admin-main-scroll" className="flex-1 min-w-0 overflow-auto bg-slate-50">
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden sticky top-0 z-20 bg-green-900 text-white flex items-center gap-3 px-4 py-3 shadow-md">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-green-800 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <Leaf className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-sm">FreshSelect</span>
          </div>
          {unreadCount > 0 && (
            <Link href="/admin/notifications">
              <button className="ml-auto relative p-1.5 rounded-lg hover:bg-green-800">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              </button>
            </Link>
          )}
        </div>

        {children}
        <InactivityGuard />
      </main>
    </div>
  );
}
