import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Users, ClipboardCheck, CheckCircle2, Loader2, ArrowRight, UserCheck,
} from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  referral: { label: "Referral", color: "text-emerald-600" },
  assessment: { label: "Assessment", color: "text-blue-600" },
  assessment_recorded: { label: "Assessment Recorded", color: "text-sky-600" },
  missing_information: { label: "Missing Information", color: "text-orange-600" },
  not_eligible: { label: "Not Eligible", color: "text-rose-600" },
  level_one_only: { label: "Level One Only", color: "text-teal-600" },
  level_one_household: { label: "Level One (household)", color: "text-purple-600" },
  level_2_active: { label: "Level 2 Active", color: "text-violet-600" },
  ineligible: { label: "Ineligible For SCN", color: "text-red-600" },
  provider_attestation_required: { label: "Provider Attestation Required", color: "text-orange-600" },
  flagged: { label: "Flagged-Needs Attention", color: "text-red-600" },
};

const STAGE_BADGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  referral: { label: "Referral", bg: "bg-emerald-100", text: "text-emerald-700" },
  assessment: { label: "Assessment", bg: "bg-blue-100", text: "text-blue-700" },
  assessment_recorded: { label: "Assessment Recorded", bg: "bg-sky-100", text: "text-sky-700" },
  missing_information: { label: "Missing Information", bg: "bg-orange-100", text: "text-orange-700" },
  not_eligible: { label: "Not Eligible", bg: "bg-rose-100", text: "text-rose-700" },
  level_one_only: { label: "Level One Only", bg: "bg-violet-100", text: "text-violet-700" },
  level_one_household: { label: "Level One (household)", bg: "bg-purple-100", text: "text-purple-700" },
  level_2_active: { label: "Level 2 Active", bg: "bg-teal-100", text: "text-teal-700" },
  ineligible: { label: "Ineligible For SCN", bg: "bg-red-100", text: "text-red-700" },
  provider_attestation_required: { label: "Provider Attestation Required", bg: "bg-orange-100", text: "text-orange-700" },
  flagged: { label: "Flagged", bg: "bg-rose-100", text: "text-rose-700" },
};

const AVATAR_COLORS = [
  "bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-amber-500",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function AdminDashboard() {
  const { user } = useAuth();

  // Assessors and org staff must not see the admin dashboard — redirect them to their own portals
  useEffect(() => {
    if (user) {
      const orgId = (user as any).orgId;
      if (orgId) {
        window.location.replace("/org");
      } else if (user.role === "assessor") {
        window.location.replace("/assessor");
      }
    }
  }, [user]);

  if (user && ((user as any).orgId || user.role === "assessor")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-900">
        <Loader2 className="h-8 w-8 animate-spin text-green-900" />
      </div>
    );
  }
  const { data: stats, isLoading: statsLoading } = trpc.admin.stats.useQuery();
  const { data: taskStats } = trpc.admin.taskStats.useQuery();
  const { data: recentClients } = trpc.admin.recentClients.useQuery({ days: 30, limit: 5 });

  const totalClients = (stats as any)?.total ?? 0;
  const stages = (stats as any)?.stages ?? {};
  const openTasks = taskStats?.open ?? 0;
  const completedTasks = taskStats?.completed ?? 0;
  const totalMembers = (stats as any)?.totalMembers ?? 0;

  const PIPELINE_STAGES = [
    "referral", "assessment", "assessment_recorded", "missing_information", "not_eligible", "level_one_only", "level_one_household", "level_2_active",
    "ineligible", "provider_attestation_required", "flagged",
  ];

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Welcome back, {user?.name || "Admin"}. — Carebridge
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/clients">
            <div className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-900">
                    {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : totalClients}
                  </p>
                  <p className="text-sm text-slate-500">Total Clients</p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/tasks">
            <div className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <ClipboardCheck className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-900">{openTasks}</p>
                  <p className="text-sm text-slate-500">Open Tasks</p>
                </div>
              </div>
            </div>
          </Link>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{completedTasks}</p>
                <p className="text-sm text-slate-500">Completed Tasks</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">
                  {statsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : totalMembers}
                </p>
                <p className="text-sm text-slate-500">Total Members</p>
                <p className="text-xs text-slate-400 mt-0.5">Clients + household</p>
              </div>
            </div>
          </div>
        </div>

        {/* Client Journey Pipeline */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Client Journey Pipeline</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {PIPELINE_STAGES.map((stageKey) => {
              const config = STAGE_CONFIG[stageKey];
              const count = stages[stageKey] ?? 0;
              const isFlagged = stageKey === "flagged";
              return (
                <Link key={stageKey} href={`/admin/clients?stage=${stageKey}`}>
                  <div className="text-center p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200">
                    <p className="text-3xl font-bold text-slate-900">{count}</p>
                    {isFlagged ? (
                      <Badge className="bg-red-100 text-red-700 text-[10px] mt-1 border-0">{config.label}</Badge>
                    ) : (
                      <p className={`text-xs font-medium mt-1 ${config.color}`}>{config.label}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Bottom Row: Recent Clients + Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Recent Clients */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Clients</h2>
              <Link href="/admin/clients">
                <span className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </div>
            {!recentClients ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : recentClients.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No recent clients</p>
            ) : (
              <div className="space-y-1">
                {recentClients.map((client) => {
                  const initials = `${(client.firstName || "")[0] || ""}${(client.lastName || "")[0] || ""}`.toUpperCase();
                  const avatarColor = getAvatarColor(`${client.firstName}${client.lastName}`);
                  const stageInfo = STAGE_BADGE_CONFIG[client.stage] || { label: client.stage, bg: "bg-slate-100", text: "text-slate-700" };
                  return (
                    <Link key={client.id} href={`/admin/clients/${client.id}`}>
                      <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-full ${avatarColor} flex items-center justify-center text-white font-medium text-xs shrink-0`}>
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{client.firstName} {client.lastName}</p>
                            <p className="text-xs text-slate-400">{client.medicaidId}</p>
                          </div>
                        </div>
                        <Badge className={`${stageInfo.bg} ${stageInfo.text} text-[10px] font-medium border-0`}>
                          {stageInfo.label}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tasks & Action Items */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tasks & Action Items</h2>
              <Link href="/admin/tasks">
                <span className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            </div>
            {openTasks === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No tasks found.</p>
            ) : (
              <p className="text-sm text-slate-600">
                {openTasks} open task{openTasks !== 1 ? "s" : ""} require attention.{" "}
                <Link href="/admin/tasks">
                  <span className="text-blue-600 hover:text-blue-700 cursor-pointer">View tasks</span>
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
