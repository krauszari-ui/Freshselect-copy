import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, Loader2, Plus, Circle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

export default function AdminTasks() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "completed" | "verified">("open");
  const [areaFilter, setAreaFilter] = useState("all");
  const [assignedToFilter, setAssignedToFilter] = useState("all");
  const [completedFrom, setCompletedFrom] = useState("");
  const [completedTo, setCompletedTo] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ submissionId: "", description: "", area: "intake_rep" as "intake_rep" | "assigned_worker" });

  const utils = trpc.useUtils();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const tasksQuery = trpc.admin.tasks.list.useQuery({
    search: debouncedSearch || undefined,
    status: statusFilter,
    area: areaFilter !== "all" ? areaFilter as any : undefined,
    assignedTo: assignedToFilter !== "all" ? Number(assignedToFilter) : undefined,
    completedFrom: completedFrom || undefined,
    completedTo: completedTo || undefined,
  });
  const statsQuery = trpc.admin.tasks.stats.useQuery();
  const staffQuery = trpc.admin.staffList.useQuery();

  const createMutation = trpc.admin.tasks.create.useMutation({
    onSuccess: () => {
      utils.admin.tasks.list.invalidate();
      utils.admin.tasks.stats.invalidate();
      setShowCreate(false);
      setNewTask({ submissionId: "", description: "", area: "intake_rep" });
    },
  });

  const updateStatusMutation = trpc.admin.tasks.updateStatus.useMutation({
    onSuccess: () => {
      utils.admin.tasks.list.invalidate();
      utils.admin.tasks.stats.invalidate();
    },
  });

  const taskStats = statsQuery.data ?? { open: 0, completed: 0, verified: 0, total: 0 };
  const tasksData = tasksQuery.data as any;
  const tasksList = tasksData?.rows ?? tasksData ?? [];
  const staffList = (staffQuery.data ?? []) as any[];

  const getStaffName = (id: number | null) => {
    if (!id) return null;
    const s = staffList.find((w: any) => w.id === id);
    return s?.name || `User #${id}`;
  };

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tasks & Action Items</h1>
            <p className="text-slate-500 text-sm mt-0.5">{taskStats.total} total tasks</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-9 w-full sm:w-auto" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Create Task
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Search */}
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search tasks, clients, or users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {/* Area */}
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Areas</SelectItem>
                <SelectItem value="intake_rep">Intake Rep</SelectItem>
                <SelectItem value="assigned_worker">Assigned Worker</SelectItem>
              </SelectContent>
            </Select>

            {/* Assigned To */}
            <Select value={assignedToFilter} onValueChange={(v) => { setAssignedToFilter(v); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Assigned To" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffList.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name || `User #${s.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Completed From */}
            <Input
              type="date"
              className="h-9 text-sm"
              value={completedFrom}
              onChange={(e) => setCompletedFrom(e.target.value)}
            />

            {/* Completed To */}
            <Input
              type="date"
              className="h-9 text-sm"
              value={completedTo}
              onChange={(e) => setCompletedTo(e.target.value)}
            />
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-4 border-b border-slate-200 pb-0">
          {(["open", "completed", "verified"] as const).map((status) => {
            const count = taskStats[status] ?? 0;
            const active = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`pb-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                  active
                    ? "border-emerald-500 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Task List */}
        {tasksQuery.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : (Array.isArray(tasksList) ? tasksList : []).length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm">No {statusFilter} tasks found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(Array.isArray(tasksList) ? tasksList : []).map((task: any) => (
              <div key={task.id} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  {/* Status circle */}
                  <button
                    onClick={() => {
                      const nextStatus = task.status === "open" ? "completed" : task.status === "completed" ? "verified" : "open";
                      updateStatusMutation.mutate({ id: task.id, status: nextStatus });
                    }}
                    className="mt-0.5"
                  >
                    <Circle className={`h-5 w-5 ${
                      task.status === "completed" ? "text-emerald-500 fill-emerald-500" :
                      task.status === "verified" ? "text-blue-500 fill-blue-500" :
                      "text-slate-300"
                    }`} />
                  </button>

                  <div className="flex-1">
                    {/* Description */}
                    <p className="text-sm text-slate-700">{task.description}</p>

                    {/* Meta row */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {/* Client name link */}
                      {task.submissionId && (
                        <Link href={`/admin/clients/${task.submissionId}`}>
                          <span className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded cursor-pointer">
                            Client #{task.submissionId}
                          </span>
                        </Link>
                      )}

                      {/* Area badge */}
                      <Badge className={`text-[10px] border-0 ${
                        task.area === "intake_rep"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700"
                      }`}>
                        {task.area === "intake_rep" ? "Intake Rep" : "Assigned Worker"}
                      </Badge>

                      {/* Assigned to */}
                      {task.assignedTo && (
                        <span className="text-xs text-slate-400">→ {getStaffName(task.assignedTo)}</span>
                      )}

                      {/* Created by + date */}
                      <span className="text-xs text-slate-400">
                        By {getStaffName(task.createdBy) || "Staff"} · {new Date(task.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <Badge className={`text-xs border-0 shrink-0 ${
                    task.status === "open" ? "bg-blue-100 text-blue-700" :
                    task.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                    "bg-purple-100 text-purple-700"
                  }`}>
                    {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Task Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Client ID"
              value={newTask.submissionId}
              onChange={(e) => setNewTask({ ...newTask, submissionId: e.target.value })}
              type="number"
            />
            <Textarea
              placeholder="Task description..."
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            />
            <Select value={newTask.area} onValueChange={(v) => setNewTask({ ...newTask, area: v as any })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="intake_rep">Intake Rep</SelectItem>
                <SelectItem value="assigned_worker">Assigned Worker</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                if (newTask.submissionId && newTask.description.trim()) {
                  createMutation.mutate({
                    submissionId: parseInt(newTask.submissionId),
                    title: newTask.description.trim().slice(0, 80),
                    description: newTask.description.trim(),
                    area: newTask.area,
                  });
                }
              }}
              disabled={!newTask.submissionId || !newTask.description.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
