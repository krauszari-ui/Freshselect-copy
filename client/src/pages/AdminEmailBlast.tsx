import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, X, Clock, CheckCircle2, Loader2, AlertCircle, MessageSquare, ChevronDown, ChevronUp, User, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  { value: "all", label: "All Clients" },
  { value: "referral", label: "Referral" },
  { value: "assessment", label: "Assessment" },
  { value: "assessment_recorded", label: "Assessment Recorded" },
  { value: "missing_information", label: "Missing Information" },
  { value: "not_eligible", label: "Not Eligible" },
  { value: "level_one_only", label: "Level One Only" },
  { value: "level_one_household", label: "Level One (household)" },
  { value: "level_2_active", label: "Level 2 Active" },
  { value: "ineligible", label: "Ineligible For SCN" },
  { value: "provider_attestation_required", label: "Provider Attestation Required" },
  { value: "flagged", label: "Flagged" },
];

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-800" },
    sending: { label: "Sending…", className: "bg-yellow-100 text-yellow-800" },
    sent: { label: "Sent", className: "bg-green-100 text-green-800" },
    cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-600" },
    failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>;
}

/** Expandable replies inbox for a single blast */
function BlastRepliesPanel({ blastId }: { blastId: number }) {
  const [open, setOpen] = useState(false);
  const { data: replies, isLoading } = trpc.emailBlast.getReplies.useQuery(
    { blastId },
    { enabled: open }
  );

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        <span>Replies inbox</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="mt-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400 py-4 justify-center text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading replies…</span>
            </div>
          ) : !replies?.length ? (
            <div className="text-center py-6 text-slate-400 text-sm">
              <MessageSquare className="h-7 w-7 mx-auto mb-2 opacity-30" />
              <p>No replies yet</p>
              <p className="text-xs mt-1">Client replies will appear here automatically</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {replies.map(reply => (
                <div key={reply.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 bg-green-100 rounded-full shrink-0">
                        <User className="h-3 w-3 text-green-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {reply.submissionId ? (
                            <Link
                              href={`/admin/clients/${reply.submissionId}`}
                              className="font-medium text-sm text-green-700 hover:underline"
                            >
                              {[reply.firstName, reply.lastName].filter(Boolean).join(" ") || reply.fromEmail}
                            </Link>
                          ) : (
                            <span className="font-medium text-sm text-slate-800">
                              {reply.fromEmail}
                            </span>
                          )}
                          <span className="text-xs text-slate-400">{reply.fromEmail}</span>
                        </div>
                        <p className="text-xs font-medium text-slate-700 mt-0.5 truncate">
                          {reply.subject}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">
                      {new Date(reply.sentAt).toLocaleString()}
                    </span>
                  </div>
                  {reply.body && (
                    <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap line-clamp-4 pl-8">
                      {reply.body}
                    </p>
                  )}
                  {reply.submissionId && (
                    <div className="mt-2 pl-8">
                      <Link
                        href={`/admin/clients/${reply.submissionId}`}
                        className="text-xs text-green-700 hover:underline"
                      >
                        View client record →
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminEmailBlast() {
  const utils = trpc.useUtils();

  // Auto-refresh every 30s when any blast is in scheduled/sending state
  const { data: blasts, isLoading } = trpc.emailBlast.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data as any[];
      if (!data) return false;
      const hasActive = data.some((b: any) => b.blastStatus === "scheduled" || b.blastStatus === "sending");
      return hasActive ? 30_000 : false;
    },
  });

  const createMutation = trpc.emailBlast.create.useMutation({
    onSuccess: () => {
      toast.success("Email blast scheduled! It will be sent at the scheduled time.");
      utils.emailBlast.list.invalidate();
      setForm({ name: "", subject: "", body: "", filterStatus: "all", scheduledAt: "" });
    },
    onError: (err: { message: string }) => {
      toast.error("Failed to schedule blast: " + err.message);
    },
  });

  const cancelMutation = trpc.emailBlast.cancel.useMutation({
    onSuccess: () => {
      toast.success("Blast cancelled");
      utils.emailBlast.list.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error("Failed to cancel blast: " + err.message);
    },
  });

  const retryMutation = trpc.emailBlast.retry.useMutation({
    onSuccess: () => {
      toast.success("Blast re-queued — it will send on the next cron tick (within 1 minute)");
      utils.emailBlast.list.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error("Failed to retry blast: " + err.message);
    },
  });

  const [form, setForm] = useState({
    name: "",
    subject: "",
    body: "",
    filterStatus: "all",
    scheduledAt: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.scheduledAt) {
      toast.error("Please select a scheduled date/time");
      return;
    }
    const scheduledAt = new Date(form.scheduledAt);
    if (scheduledAt <= new Date()) {
      toast.error("Scheduled time must be in the future");
      return;
    }
    createMutation.mutate({
      name: form.name,
      subject: form.subject,
      body: form.body,
      filterStatus: form.filterStatus === "all" ? null : form.filterStatus,
      scheduledAt,
    });
  }

  // Default to tomorrow 11am local time for convenience
  function setTomorrow11am() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setForm(f => ({ ...f, scheduledAt: local }));
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <Mail className="h-6 w-6 text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Email Blast</h1>
            <p className="text-sm text-slate-500">Schedule a one-time email to all clients or a filtered group</p>
          </div>
        </div>

        {/* Compose form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compose New Blast</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="blast-name">Blast Name (internal)</Label>
                  <Input
                    id="blast-name"
                    placeholder="e.g. May Newsletter"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="blast-filter">Send To</Label>
                  <Select value={form.filterStatus} onValueChange={v => setForm(f => ({ ...f, filterStatus: v }))}>
                    <SelectTrigger id="blast-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="blast-subject">Email Subject</Label>
                <Input
                  id="blast-subject"
                  placeholder="e.g. Important update from FreshSelect Meals"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="blast-body">Email Body</Label>
                <Textarea
                  id="blast-body"
                  placeholder="Write your message here. Use plain text — line breaks will be preserved."
                  rows={7}
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  required
                  className="resize-y"
                />
                <p className="text-xs text-slate-400">
                  The email will be addressed "Dear [First Name] [Last Name]," automatically.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="blast-time">Scheduled Date &amp; Time (your local time)</Label>
                <div className="flex gap-2">
                  <Input
                    id="blast-time"
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                    required
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={setTomorrow11am} className="shrink-0 text-xs">
                    Tomorrow 11am
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Emails will be sent to all clients with a valid email address matching the selected filter. You can cancel a scheduled blast before it sends.</span>
              </div>

              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-green-700 hover:bg-green-800 text-white"
              >
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scheduling…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Schedule Blast</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Blast history */}
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Blast History</h2>
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading…</span>
            </div>
          ) : !blasts?.length ? (
            <div className="text-center py-12 text-slate-400">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No email blasts yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blasts.map((blast: any) => (
                <Card key={blast.id} className="border border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900">{blast.name}</span>
                          {statusBadge(blast.blastStatus)}
                          {blast.filterStatus && blast.filterStatus !== "all" && (
                            <Badge variant="outline" className="text-xs">{blast.filterStatus}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5 truncate">Subject: {blast.subject}</p>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Scheduled: {new Date(blast.scheduledAt).toLocaleString()}
                          </span>
                          {blast.sentAt && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              Sent: {new Date(blast.sentAt).toLocaleString()}
                            </span>
                          )}
                          {blast.blastStatus === "sent" && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              {blast.sentCount ?? 0} delivered, {blast.failedCount ?? 0} failed
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {blast.blastStatus === "scheduled" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            disabled={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate({ id: blast.id })}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                        )}
                        {(blast.blastStatus === "failed" || blast.blastStatus === "sending") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-amber-700 border-amber-300 hover:bg-amber-50"
                            disabled={retryMutation.isPending}
                            onClick={() => retryMutation.mutate({ id: blast.id })}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            Retry
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Replies inbox — only shown for sent blasts */}
                    {blast.blastStatus === "sent" && (
                      <BlastRepliesPanel blastId={blast.id} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
