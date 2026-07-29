import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Heart,
  Home,
  Loader2,
  Mail,
  MessageSquare,
  PauseCircle,
  Phone,
  Save,
  Send,
  ShieldCheck,
  Store,
  User,
  Users,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

type StatusKey = "new" | "in_review" | "approved" | "rejected" | "on_hold";

const STATUS_CONFIG: Record<StatusKey, { label: string; color: string; icon: React.ReactNode }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <ClipboardList className="w-3.5 h-3.5" /> },
  in_review: { label: "In Review", color: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock className="w-3.5 h-3.5" /> },
  approved: { label: "Approved", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="w-3.5 h-3.5" /> },
  on_hold: { label: "On Hold", color: "bg-gray-100 text-gray-700 border-gray-200", icon: <PauseCircle className="w-3.5 h-3.5" /> },
};

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground mt-0.5">{value}</dd>
    </div>
  );
}

export default function AdminApplicationDetail() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);

  const [status, setStatus] = useState<StatusKey>("new");
  const [adminNotes, setAdminNotes] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [referrerNote, setReferrerNote] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/admin");
    const staffRoles = ["super_admin", "admin", "worker", "viewer"];
    if (!loading && user && !staffRoles.includes(user.role)) navigate("/admin");
  }, [user, loading, navigate]);

  const query = trpc.admin.getById.useQuery({ id }, { enabled: id > 0 });
  const utils = trpc.useUtils();
  const referrerNotesQuery = trpc.admin.listReferrerNotes.useQuery({ submissionId: id }, { enabled: id > 0 });
  const sendReferrerNoteMutation = trpc.admin.sendReferrerNote.useMutation({
    onSuccess: () => {
      setReferrerNote("");
      utils.admin.listReferrerNotes.invalidate({ submissionId: id });
      toast.success("Note sent to referrer");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.admin.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Application updated successfully");
      setIsDirty(false);
      utils.admin.getById.invalidate({ id });
      utils.admin.list.invalidate();
      utils.admin.stats.invalidate();
    },
    onError: (err) => {
      toast.error("Failed to update: " + err.message);
    },
  });

  // Sync local state when data loads
  useEffect(() => {
    if (query.data) {
      setStatus(query.data.status as StatusKey);
      setAdminNotes(query.data.adminNotes ?? "");
    }
  }, [query.data]);

  const handleSave = () => {
    updateMutation.mutate({ id, status, adminNotes });
  };

  if (loading || query.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <p className="text-muted-foreground">Application not found.</p>
        <Button variant="outline" onClick={() => navigate("/admin/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const sub = query.data;
  const form = sub.formData as Record<string, unknown>;
  const statusCfg = STATUS_CONFIG[sub.status as StatusKey];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border/50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin/dashboard")}
              className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-primary" />
              </div>
              <span className="font-semibold text-sm text-foreground">
                {sub.firstName} {sub.lastName}
              </span>
              <span
                className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.color}`}
              >
                {statusCfg.icon}
                {statusCfg.label}
              </span>
              {(form.newApplicant as string) && (
                <span
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                    form.newApplicant === "New"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  {form.newApplicant === "New" ? "New Client" : `Transfer${(form.transferAgencyName as string) ? ` — ${form.transferAgencyName as string}` : ""}`}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs font-mono text-muted-foreground">#{sub.referenceNumber}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Application Details */}
          <div className="lg:col-span-2 space-y-4">
            {/* Primary Member Info */}
            <Section title="Primary Member Information" icon={<User className="w-4 h-4" />}>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="First Name" value={sub.firstName} />
                <Field label="Last Name" value={sub.lastName} />
                <Field label="Date of Birth" value={form.dateOfBirth as string} />
                <Field label="Medicaid ID" value={sub.medicaidId} />
              </dl>
            </Section>

            {/* Contact */}
            <Section title="Contact Information" icon={<Phone className="w-4 h-4" />}>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Cell Phone" value={sub.cellPhone} />
                <Field label="Home Phone" value={form.homePhone as string} />
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd className="text-sm font-medium text-foreground mt-0.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    {sub.email}
                  </dd>
                </div>
              </dl>
            </Section>

            {/* Address */}
            <Section title="Address" icon={<Home className="w-4 h-4" />}>
              <dl className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Field
                    label="Street Address"
                    value={[form.streetAddress as string, form.aptUnit as string].filter(Boolean).join(", ")}
                  />
                </div>
                <Field label="City" value={form.city as string} />
                <Field label="State" value={form.state as string} />
                <Field label="Zipcode" value={form.zipcode as string} />
              </dl>
            </Section>

            {/* Vendor */}
            <Section title="Vendor" icon={<Store className="w-4 h-4" />}>
              <p className="text-sm font-medium text-foreground">{sub.supermarket}</p>
              {sub.referralSource && (
                <p className="text-xs text-muted-foreground mt-1">Referral: {sub.referralSource}</p>
              )}
            </Section>

            {/* Health Categories */}
            {Array.isArray(form.healthCategories) && (form.healthCategories as string[]).length > 0 && (
              <Section title="Health Categories" icon={<Heart className="w-4 h-4" />}>
                <div className="flex flex-wrap gap-2">
                  {(form.healthCategories as string[]).map((cat) => (
                    <span
                      key={cat}
                      className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                <dl className="grid grid-cols-2 gap-3 mt-3">
                  <Field label="Due Date" value={form.dueDate as string} />
                  <Field label="Date of Miscarriage" value={form.miscarriageDate as string} />
                  <Field label="Infant Name" value={form.infantName as string} />
                  <Field label="Infant Date of Birth" value={form.infantDateOfBirth as string} />
                  <Field label="Infant Medicaid ID" value={form.infantMedicaidId as string} />
                </dl>
              </Section>
            )}

            {/* Benefits */}
            <Section title="Benefits & Employment" icon={<ClipboardList className="w-4 h-4" />}>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Employed" value={form.employed as string} />
                <Field label="Spouse Employed" value={form.spouseEmployed as string} />
                <Field label="WIC" value={form.hasWic as string} />
                <Field label="SNAP" value={form.hasSnap as string} />
                <Field
                  label="Applicant Type"
                  value={
                    form.newApplicant === "New"
                      ? "New Client"
                      : form.newApplicant === "Transfer"
                      ? `Transfer${form.transferAgencyName ? ` — ${form.transferAgencyName}` : ""}`
                      : (form.newApplicant as string) || "—"
                  }
                />
                {form.newApplicant === "Transfer" && (form.transferAgencyName as string) && (
                  <Field label="Transfer Agency" value={form.transferAgencyName as string} />
                )}
                <Field label="Food Allergies" value={form.foodAllergies as string} />
              </dl>
            </Section>

            {/* Household Members */}
            {Array.isArray(form.householdMembers) && (form.householdMembers as unknown[]).length > 0 && (
              <Section title="Additional Household Members" icon={<Users className="w-4 h-4" />}>
                <div className="space-y-3">
                  {(form.householdMembers as { name: string; dateOfBirth: string; medicaidId: string }[]).map(
                    (m, i) => (
                      <div key={i} className="p-3 rounded-lg bg-muted/40 border border-border/30">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Member {i + 1}</p>
                        <dl className="grid grid-cols-3 gap-2">
                          <Field label="Name" value={m.name} />
                          <Field label="Date of Birth" value={m.dateOfBirth} />
                          <Field label="Medicaid ID" value={m.medicaidId} />
                        </dl>
                      </div>
                    )
                  )}
                </div>
              </Section>
            )}

            {/* Meal Preferences */}
            <Section title="Meal Preferences" icon={<UtensilsCrossed className="w-4 h-4" />}>
              <dl className="space-y-3">
                {Array.isArray(form.mealFocus) && (form.mealFocus as string[]).length > 0 && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Meal Focus</dt>
                    <dd className="flex flex-wrap gap-1.5 mt-1">
                      {(form.mealFocus as string[]).map((f) => (
                        <span key={f} className="px-2 py-0.5 rounded bg-muted text-xs font-medium capitalize">
                          {f}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Breakfast Items" value={form.breakfastItems as string} />
                  <Field label="Lunch Items" value={form.lunchItems as string} />
                  <Field label="Dinner Items" value={form.dinnerItems as string} />
                  <Field label="Snack Items" value={form.snackItems as string} />
                </div>
              </dl>
            </Section>

            {/* Appliances */}
            <Section title="Household Appliances" icon={<Home className="w-4 h-4" />}>
              <dl className="grid grid-cols-3 gap-3">
                <Field label="Refrigerator" value={form.needsRefrigerator as string} />
                <Field label="Microwave" value={form.needsMicrowave as string} />
                <Field label="Cooking Utensils" value={form.needsCookingUtensils as string} />
              </dl>
            </Section>

            {/* HIPAA */}
            <Section title="Legal & Compliance" icon={<ShieldCheck className="w-4 h-4" />}>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="font-medium text-foreground">HIPAA Consent Granted</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(sub.hipaaConsentAt).toLocaleString()}
              </p>
            </Section>
          </div>

          {/* Right: Status Management */}
          <div className="space-y-4">
            {/* Status Card */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Application Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Current Status</label>
                  <Select
                    value={status}
                    onValueChange={(v) => {
                      setStatus(v as StatusKey);
                      setIsDirty(true);
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Admin Notes</label>
                  <Textarea
                    placeholder="Add internal notes about this application..."
                    value={adminNotes}
                    onChange={(e) => {
                      setAdminNotes(e.target.value);
                      setIsDirty(true);
                    }}
                    className="text-sm resize-none h-28"
                  />
                </div>

                <Button
                  className="w-full gap-2 font-semibold"
                  onClick={handleSave}
                  disabled={!isDirty || updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Changes
                </Button>

                {/* Meta */}
                <div className="pt-2 border-t border-border/30 space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Submitted</span>
                    <span>{new Date(sub.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Updated</span>
                    <span>{new Date(sub.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {sub.referralSource && (
                    <div className="flex justify-between">
                      <span>Referral</span>
                      <span>{sub.referralSource}</span>
                    </div>
                  )}
                  {(form.newApplicant as string) && (
                    <div className="flex justify-between items-center">
                      <span>Type</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          form.newApplicant === "New"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {form.newApplicant === "New" ? "New Client" : "Transfer"}
                      </span>
                    </div>
                  )}
                  {form.newApplicant === "Transfer" && (form.transferAgencyName as string) && (
                    <div className="flex justify-between">
                      <span>Transfer Agency</span>
                      <span className="text-right max-w-[140px] truncate" title={form.transferAgencyName as string}>{form.transferAgencyName as string}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Referrer Notes */}
            {sub.referralSource && (
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    Referrer Notes
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Messages to referrer <strong>{sub.referralSource}</strong> about this client. Visible on their portal.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Existing notes */}
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {referrerNotesQuery.isLoading ? (
                      <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                    ) : (referrerNotesQuery.data ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No notes sent yet</p>
                    ) : (
                      (referrerNotesQuery.data as any[]).map((msg: any) => (
                        <div key={msg.id} className="bg-slate-50 rounded-md p-2.5 border border-slate-200">
                          <p className="text-sm text-slate-800">{msg.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {new Date(msg.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            {!msg.readAt && <span className="ml-2 text-amber-500 font-medium">Unread</span>}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Compose */}
                  <Textarea
                    placeholder={`e.g., Please provide the DOB for ${sub.firstName} ${sub.lastName}`}
                    value={referrerNote}
                    onChange={(e) => setReferrerNote(e.target.value)}
                    className="text-sm resize-none h-20"
                  />
                  <Button
                    size="sm"
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => sendReferrerNoteMutation.mutate({ submissionId: id, message: referrerNote })}
                    disabled={!referrerNote.trim() || sendReferrerNoteMutation.isPending}
                  >
                    {sendReferrerNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send to Referrer
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
