import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, TrendingUp, ClipboardCheck, AlertTriangle, Loader2, ArrowRight,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ineligible: { label: "Ineligible For SCN", bg: "bg-red-100", text: "text-red-700" },
  level_one_household: { label: "Level One (household)", bg: "bg-purple-100", text: "text-purple-700" },
  level_2_active: { label: "Level 2 Active", bg: "bg-teal-100", text: "text-teal-700" },
  level_one_only: { label: "Level One Only", bg: "bg-violet-100", text: "text-violet-700" },
  referral: { label: "Referral", bg: "bg-emerald-100", text: "text-emerald-700" },
  assessment: { label: "Assessment", bg: "bg-blue-100", text: "text-blue-700" },
  assessment_recorded: { label: "Assessment Recorded", bg: "bg-sky-100", text: "text-sky-700" },
  missing_information: { label: "Missing Information", bg: "bg-orange-100", text: "text-orange-700" },
  not_eligible: { label: "Not Eligible", bg: "bg-rose-100", text: "text-rose-700" },
  provider_attestation_required: { label: "Provider Attestation Required", bg: "bg-orange-100", text: "text-orange-700" },
  flagged: { label: "Flagged-Needs Attention", bg: "bg-rose-100", text: "text-rose-700" },
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

export default function AdminAgency() {
  const [timeRange, setTimeRange] = useState("7");

  const { data: stats, isLoading } = trpc.admin.stats.useQuery();
  const { data: addedThisWeek } = trpc.admin.addedCount.useQuery({ days: parseInt(timeRange) });
  const { data: addedToday } = trpc.admin.addedCount.useQuery({ days: 1 });
  const { data: taskStats } = trpc.admin.taskStats.useQuery();
  const { data: recentClients } = trpc.admin.recentClients.useQuery({ days: parseInt(timeRange), limit: 10 });

  const total = (stats as any)?.total ?? 0;
  const stages = (stats as any)?.stages ?? {};
  const openTasks = taskStats?.open ?? 0;
  const ineligibleCount = stages.ineligible ?? 0;

  // Sort stages by count descending
  const sortedStages = Object.entries(stages)
    .sort(([, a], [, b]) => (b as number) - (a as number));

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Carebridge — Overview</h1>
            <p className="text-slate-500 text-sm mt-0.5">Your agency's performance at a glance</p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px] h-9 text-sm bg-white border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Today</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{isLoading ? "..." : total}</p>
                <p className="text-sm text-slate-500">Total Clients</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{addedThisWeek ?? 0}</p>
                <p className="text-sm text-slate-500">Added ({timeRange}d)</p>
                <p className="text-xs text-emerald-600">{addedToday ?? 0} today</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
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

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">{ineligibleCount}</p>
                <p className="text-sm text-slate-500">Zipcode Ineligible</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Column */}
          <div className="space-y-5">
            {/* Client Stages */}
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Client Stages</h2>
              <div className="space-y-2.5">
                {sortedStages.map(([key, count]) => {
                  const config = STAGE_CONFIG[key];
                  if (!config) return null;
                  const isFlagged = key === "flagged";
                  return (
                    <Link key={key} href={`/admin/clients?stage=${key}`}>
                      <div className="flex items-center justify-between py-1.5 hover:bg-slate-50 rounded px-2 -mx-2 cursor-pointer transition-colors">
                        <div>
                          {isFlagged ? (
                            <Badge className={`${config.bg} ${config.text} text-xs border-0`}>{config.label}</Badge>
                          ) : (
                            <Badge className={`${config.bg} ${config.text} text-xs border-0`}>{config.label}</Badge>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{count as number}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* No Activity in 30+ Days */}
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">No Activity in 30+ Days (0)</h2>
              <p className="text-sm text-slate-500">
                Active clients who haven't been updated in over 30 days — may need follow-up.
              </p>
              <p className="text-sm text-slate-400 mt-2">
                All active clients have been updated within the last 30 days.
              </p>
            </div>

            {/* Outstanding Tasks */}
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Tasks ({openTasks})</h2>
                <Link href="/admin/tasks">
                  <span className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                    View all <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              </div>
              {openTasks === 0 ? (
                <p className="text-sm text-slate-400">No outstanding tasks.</p>
              ) : (
                <p className="text-sm text-slate-600">
                  {openTasks} task{openTasks !== 1 ? "s" : ""} need attention.{" "}
                  <Link href="/admin/tasks">
                    <span className="text-blue-600 hover:text-blue-700 cursor-pointer">View tasks</span>
                  </Link>
                </p>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            {/* Recently Added */}
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Recently Added — Last {timeRange} Days ({addedThisWeek ?? 0})
                </h2>
                <Link href="/admin/clients">
                  <span className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer">View all</span>
                </Link>
              </div>
              {!recentClients ? (
                <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
              ) : recentClients.length === 0 ? (
                <p className="text-sm text-slate-400">No clients added in this period.</p>
              ) : (
                <div className="space-y-1">
                  {recentClients.map((client) => {
                    const initials = `${(client.firstName || "")[0] || ""}${(client.lastName || "")[0] || ""}`.toUpperCase();
                    const avatarColor = getAvatarColor(`${client.firstName}${client.lastName}`);
                    const stageInfo = STAGE_CONFIG[client.stage] || { label: client.stage, bg: "bg-slate-100", text: "text-slate-700" };
                    return (
                      <Link key={client.id} href={`/admin/clients/${client.id}`}>
                        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full ${avatarColor} flex items-center justify-center text-white font-medium text-xs shrink-0`}>
                              {initials}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{client.firstName} {client.lastName}</p>
                              <p className="text-xs text-slate-400">{new Date(client.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
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

            {/* Zipcode Ineligible */}
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Zipcode Ineligible ({ineligibleCount})
              </h2>
              <Link href="/admin/clients?stage=ineligible">
                <span className="text-sm text-blue-600 hover:text-blue-700 cursor-pointer">
                  View all ineligible clients →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
