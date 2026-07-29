import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LogIn, LogOut, Users, Eye, Loader2, Mail, Lock, Search,
  UserCheck, Clock, AlertCircle, ChevronLeft, ChevronRight,
  Bell, MessageSquare, Send, Reply, Trash2, Paperclip,
} from "lucide-react";
import { toast } from "sonner";

const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  referral: { label: "Referral", bg: "bg-emerald-100", text: "text-emerald-700" },
  assessment: { label: "Assessment", bg: "bg-blue-100", text: "text-blue-700" },
  assessment_recorded: { label: "Assessment Recorded", bg: "bg-sky-100", text: "text-sky-700" },
  missing_information: { label: "Missing Information", bg: "bg-orange-100", text: "text-orange-700" },
  not_eligible: { label: "Not Eligible", bg: "bg-rose-100", text: "text-rose-700" },
  level_one_only: { label: "Level One Only", bg: "bg-violet-100", text: "text-violet-700" },
  level_one_household: { label: "Level One (Household)", bg: "bg-purple-100", text: "text-purple-700" },
  level_2_active: { label: "Level 2 Active", bg: "bg-teal-100", text: "text-teal-700" },
  ineligible: { label: "Ineligible", bg: "bg-red-100", text: "text-red-700" },
  provider_attestation_required: { label: "Provider Attestation Required", bg: "bg-orange-100", text: "text-orange-700" },
  flagged: { label: "Flagged", bg: "bg-rose-100", text: "text-rose-700" },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: "New", bg: "bg-blue-100", text: "text-blue-700" },
  in_review: { label: "In Review", bg: "bg-amber-100", text: "text-amber-700" },
  approved: { label: "Approved", bg: "bg-green-100", text: "text-green-700" },
  rejected: { label: "Rejected", bg: "bg-red-100", text: "text-red-700" },
  on_hold: { label: "On Hold", bg: "bg-gray-100", text: "text-gray-700" },
};

const ITEMS_PER_PAGE = 10;

export default function ReferrerPortal() {
  const [session, setSession] = useState<{
    referrerId: number;
    referrerName: string;
    code: string;
  } | null>(null);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const loginMutation = trpc.admin.referrerPortal.login.useMutation({
    onSuccess: (data) => {
      setSession({ referrerId: data.referrerId, referrerName: data.referrerName, code: data.code });
      setLoginError("");
      toast.success(`Welcome, ${data.referrerName}!`);
    },
    onError: (err) => {
      setLoginError(err.message || "Invalid email or password");
    },
  });

  const { data: clients, isLoading: clientsLoading } = trpc.admin.referrerPortal.myClients.useQuery(
    { code: session?.code || "" },
    { enabled: !!session }
  );

  const { data: stats } = trpc.admin.referrerPortal.myStats.useQuery(
    { code: session?.code || "" },
    { enabled: !!session }
  );

  const { data: messages, isLoading: messagesLoading } = trpc.admin.referrerPortal.myMessages.useQuery(
    { code: session?.code || "" },
    { enabled: !!session, refetchInterval: 30000 }
  );

  const unreadCount = (messages as any[] | undefined)?.filter((m: any) => !m.readAt).length ?? 0;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      setLoginError("Please enter both email and password");
      return;
    }
    loginMutation.mutate(loginForm);
  };

  const [activeTab, setActiveTab] = useState<"clients" | "messages">("clients");
  const [replyText, setReplyText] = useState("");
  const [replyingToId, setReplyingToId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const [replyAttachmentUrl, setReplyAttachmentUrl] = useState<string | null>(null);
  const [uploadingReplyAttachment, setUploadingReplyAttachment] = useState(false);
  const replyAttachRef = useRef<HTMLInputElement>(null);
  const uploadDocMutation = trpc.upload.document.useMutation();

  const replyMutation = trpc.admin.referrerPortal.reply.useMutation({
    onSuccess: () => {
      setReplyText("");
      setReplyingToId(null);
      setReplyAttachmentUrl(null);
      utils.admin.referrerPortal.myMessages.invalidate();
      toast.success("Reply sent!");
    },
    onError: (err) => toast.error(err.message || "Failed to send reply"),
  });

  const markAllReadMutation = trpc.admin.referrerPortal.markAllRead.useMutation({
    onSuccess: () => utils.admin.referrerPortal.myMessages.invalidate(),
  });

  const deleteMessageMutation = trpc.admin.referrerPortal.deleteMessage.useMutation({
    onSuccess: () => {
      utils.admin.referrerPortal.myMessages.invalidate();
      toast.success("Message deleted");
    },
    onError: (err) => toast.error(err.message || "Failed to delete message"),
  });

  // Auto-mark all messages as read when the Messages tab is opened
  useEffect(() => {
    if (activeTab === "messages" && session && unreadCount > 0) {
      markAllReadMutation.mutate({ code: session.code });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleReplyAttachUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReplyAttachment(true);
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadDocMutation.mutateAsync({
        fileName: file.name, fileData, contentType: file.type || "application/octet-stream", category: "referrer-reply",
      });
      setReplyAttachmentUrl(result.url);
      toast.success(`Attached: ${file.name}`);
    } catch { toast.error("Failed to upload attachment"); }
    finally { setUploadingReplyAttachment(false); e.target.value = ""; }
  };

  const handleLogout = () => {
    setSession(null);
    setLoginForm({ email: "", password: "" });
    setSearch("");
    setPage(1);
    setActiveTab("clients");
  };

  // Filter and paginate clients
  const filteredClients = (clients || []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.firstName ?? "").toLowerCase().includes(q) ||
      (c.lastName ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.cellPhone ?? "").includes(q)
    );
  });

  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);
  const paginatedClients = filteredClients.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  // ─── Login Screen ──────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-xl">FS</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Referrer Portal</h1>
            <p className="text-gray-500 mt-1">Track your referred clients</p>
          </div>

          <Card className="shadow-lg border-0">
            <CardContent className="p-6">
              <form onSubmit={handleLogin} className="space-y-4">
                {loginError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-700">{loginError}</p>
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium text-gray-700">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="email"
                      value={loginForm.email}
                      onChange={(e) => { setLoginForm((p) => ({ ...p, email: e.target.value })); setLoginError(""); }}
                      placeholder="your@email.com"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700">Password</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => { setLoginForm((p) => ({ ...p, password: e.target.value })); setLoginError(""); }}
                      placeholder="Enter your password"
                      className="pl-10"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full bg-green-700 hover:bg-green-800 text-white"
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <LogIn className="w-4 h-4 mr-2" />
                  )}
                  Sign In
                </Button>
              </form>

              <p className="text-xs text-gray-400 text-center mt-4">
                Contact your agency administrator if you need access.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Referrer Dashboard ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-green-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">FS</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">FreshSelect Meals</h1>
                <p className="text-xs text-gray-500">Referrer Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{session.referrerName}</p>
                <p className="text-xs text-gray-500">Referral Code: {session.code}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-1" /> Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats?.totalClients ?? 0}</p>
                  <p className="text-xs text-gray-500">Total Referrals</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-violet-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats?.totalMembers ?? 0}</p>
                  <p className="text-xs text-gray-500">Total Members</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {(stats?.stages?.referral ?? 0) + (stats?.stages?.assessment ?? 0)}
                  </p>
                  <p className="text-xs text-gray-500">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all ${unreadCount > 0 ? "ring-2 ring-amber-400" : ""}`}
            onClick={() => setActiveTab("messages")}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Bell className="w-5 h-5 text-amber-700" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{unreadCount}</p>
                  <p className="text-xs text-gray-500">Unread Messages</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("clients")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "clients"
                ? "bg-green-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <Users className="w-4 h-4 inline mr-1.5" />Clients
          </button>
          <button
            onClick={() => setActiveTab("messages")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
              activeTab === "messages"
                ? "bg-green-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <MessageSquare className="w-4 h-4 inline mr-1.5" />Messages
            {unreadCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Messages Tab */}
        {activeTab === "messages" && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                Messages from FreshSelect Meals
              </CardTitle>
              <p className="text-sm text-gray-500">Action items and requests from the FreshSelect Meals team about your clients.</p>
            </CardHeader>
            <CardContent>
              {messagesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>
              ) : !messages || (messages as any[]).length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                  <p className="font-medium">No messages yet</p>
                  <p className="text-sm mt-1">The FreshSelect Meals team will send you action items here.</p>
                </div>
              ) : (
                <>
                <input ref={replyAttachRef} type="file" className="hidden" onChange={handleReplyAttachUpload} />
                <div className="space-y-3">
                  {(messages as any[]).map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`rounded-lg p-4 border group ${
                        msg.direction === "referrer"
                          ? "bg-blue-50 border-blue-200 ml-6"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          {msg.direction === "referrer" ? (
                            <p className="text-xs font-semibold text-blue-600 mb-1">Your reply</p>
                          ) : (msg.clientFirstName || msg.clientLastName) ? (
                            <p className="text-xs font-semibold text-amber-700 mb-1">
                              Re: {[msg.clientFirstName, msg.clientLastName].filter(Boolean).join(" ")}
                            </p>
                          ) : null}
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.message}</p>
                          {msg.attachmentUrl && (
                            <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-xs text-emerald-600 hover:underline">
                              <Paperclip className="w-3 h-3" /> Attachment
                            </a>
                          )}
                        </div>
                        <button
                          onClick={() => session && deleteMessageMutation.mutate({ code: session.code, messageId: msg.id })}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 rounded shrink-0"
                          title="Delete message"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-gray-400">
                          {new Date(msg.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                        {msg.direction !== "referrer" && (
                          <button
                            onClick={() => { setReplyingToId(replyingToId === msg.id ? null : msg.id); setReplyAttachmentUrl(null); }}
                            className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 font-medium"
                          >
                            <Reply className="w-3.5 h-3.5" /> Reply
                          </button>
                        )}
                      </div>
                      {replyingToId === msg.id && (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Type your reply..."
                            rows={2}
                            className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          {replyAttachmentUrl && (
                            <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                              <Paperclip className="w-3 h-3 text-emerald-500" /> Attachment ready
                              <button onClick={() => setReplyAttachmentUrl(null)} className="text-red-400 hover:text-red-600 ml-1">&times;</button>
                            </span>
                          )}
                          <div className="flex items-center gap-2">
                            <Button
                              type="button" variant="outline" size="sm"
                              className="h-8 text-xs gap-1 border-gray-200 text-gray-600"
                              onClick={() => replyAttachRef.current?.click()}
                              disabled={uploadingReplyAttachment}
                            >
                              {uploadingReplyAttachment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                              Attach
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 ml-auto"
                              disabled={!replyText.trim() || replyMutation.isPending}
                              onClick={() => {
                                if (!session || !replyText.trim()) return;
                                replyMutation.mutate({
                                  code: session.code,
                                  message: replyText.trim(),
                                  submissionId: msg.submissionId ?? undefined,
                                  attachmentUrl: replyAttachmentUrl ?? undefined,
                                });
                              }}
                            >
                              {replyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              Send Reply
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Client List */}
        {activeTab === "clients" && (<Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-lg">Your Referred Clients</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search clients..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {clientsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-green-600" />
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No referred clients yet</p>
                <p className="text-sm mt-1">Share your referral link to start tracking clients</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Client Name</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Phone</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Email</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Vendor</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Stage</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedClients.map((client) => {
                        const stageConf = STAGE_CONFIG[client.stage] || { label: client.stage, bg: "bg-gray-100", text: "text-gray-700" };
                        const statusConf = STATUS_CONFIG[client.status] || { label: client.status, bg: "bg-gray-100", text: "text-gray-700" };
                        return (
                          <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold text-xs">
                                  {(client.firstName[0] || "")}{(client.lastName[0] || "")}
                                </div>
                                <span className="font-medium text-gray-900">
                                  {client.firstName} {client.lastName}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-600">{client.cellPhone}</td>
                            <td className="py-3 px-4 text-gray-600">{client.email}</td>
                            <td className="py-3 px-4 text-gray-600">{client.supermarket}</td>
                            <td className="py-3 px-4">
                              <Badge className={`${stageConf.bg} ${stageConf.text} border-0 text-xs`}>
                                {stageConf.label}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <Badge className={`${statusConf.bg} ${statusConf.text} border-0 text-xs`}>
                                {statusConf.label}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-gray-500 text-xs">
                              {new Date(client.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                    <p className="text-sm text-gray-500">
                      Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filteredClients.length)} of {filteredClients.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-gray-600 px-2">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>)}

        {/* Info Banner */}
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <Eye className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Read-Only Access</p>
            <p className="text-sm text-green-700 mt-0.5">
              You can view the status and progress of clients you've referred. For any changes or questions, please contact the agency at (718) 307-4664.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
