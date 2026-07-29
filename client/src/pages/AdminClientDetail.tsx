import AdminLayout from "@/components/AdminLayout";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Loader2, FileText, Plus, ChevronDown, ChevronUp,
  Pencil, Trash2, Upload, ExternalLink, Link2, Save, MessageSquare, Send, Mail, Paperclip,
  MailOpen, Reply, Clock, RefreshCw, CheckCircle2, XCircle, X, Activity, User, Tag, Layers,
  FileUp, StickyNote, CheckSquare, AlertTriangle, ShieldCheck, AlertCircle, Ban, Download,
} from "lucide-react";
import { generateClientPdf } from "@/lib/generateClientPdf";
import { ClientChatTab } from "@/components/ClientChatTab";
import { useOpenDocument } from "@/hooks/useOpenDocument";
import { useState, useRef, useEffect } from "react";
import { formatLocalDate, formatLocalDateShort } from "@/lib/utils";
import { Link, useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
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

const DOCUMENT_TYPES = [
  { value: "provider_attestation", label: "Provider Attestation" },
  { value: "consent", label: "Consent" },
  { value: "supporting_documentation", label: "Supporting Documentation" },
  { value: "id_document", label: "ID" },
  { value: "medicaid_card", label: "Medicaid Card" },
  { value: "birth_certificate", label: "Birth Certificate" },
];

// ─── Activity Tab Helpers ─────────────────────────────────────────────────
function getActivityIcon(action: string) {
  if (action.includes("stage")) return Layers;
  if (action.includes("priority")) return Tag;
  if (action.includes("note")) return StickyNote;
  if (action.includes("document") || action.includes("upload")) return FileUp;
  if (action.includes("task")) return CheckSquare;
  if (action.includes("assessment")) return ShieldCheck;
  if (action.includes("email")) return Mail;
  if (action.includes("flag") || action.includes("duplicate")) return AlertTriangle;
  if (action.includes("assign")) return User;
  return Activity;
}

function getActivityMeta(action: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    stage_changed: { label: "Stage changed", color: "bg-blue-50 text-blue-500" },
    priority_changed: { label: "Priority changed", color: "bg-orange-50 text-orange-500" },
    note_added: { label: "Note added", color: "bg-yellow-50 text-yellow-600" },
    document_uploaded: { label: "Document uploaded", color: "bg-violet-50 text-violet-500" },
    task_created: { label: "Task created", color: "bg-teal-50 text-teal-600" },
    task_completed: { label: "Task completed", color: "bg-emerald-50 text-emerald-600" },
    assessment_completed: { label: "Assessment completed", color: "bg-emerald-50 text-emerald-600" },
    email_sent: { label: "Email sent", color: "bg-sky-50 text-sky-500" },
    email_received: { label: "Email received", color: "bg-sky-50 text-sky-500" },
    flagged: { label: "Client flagged", color: "bg-red-50 text-red-500" },
    unflagged: { label: "Flag removed", color: "bg-slate-50 text-slate-500" },
    duplicate_merged: { label: "Duplicate merged", color: "bg-rose-50 text-rose-500" },
    assigned: { label: "Staff assigned", color: "bg-indigo-50 text-indigo-500" },
    client_created: { label: "Client created", color: "bg-emerald-50 text-emerald-600" },
    client_updated: { label: "Client updated", color: "bg-slate-50 text-slate-500" },
    client_deleted: { label: "Client deleted", color: "bg-red-50 text-red-500" },
  };
  return map[action] ?? { label: action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), color: "bg-slate-50 text-slate-400" };
}

function ActivityDetails({ action, details }: { action: string; details: any }) {
  if (!details || typeof details !== "object") return null;
  const parts: string[] = [];
  if (action === "stage_changed" && details.from && details.to) {
    parts.push(`${details.from} → ${details.to}`);
  } else if (action === "priority_changed" && details.from && details.to) {
    parts.push(`${details.from} → ${details.to}`);
  } else if (action === "assigned" && details.assignedTo) {
    parts.push(`Assigned to ${details.assignedTo}`);
  } else if (details.subject) {
    parts.push(details.subject);
  } else if (details.name) {
    parts.push(details.name);
  } else if (details.type) {
    parts.push(details.type);
  }
  if (parts.length === 0) return null;
  return <p className="text-xs text-slate-500 mt-0.5">{parts.join(" • ")}</p>;
}

function InfoLine({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-900">{value || "—"}</span>
    </div>
  );
}

function ScreeningLine({ num, label, value }: { num: number; label: string; value: string | boolean | null | undefined }) {
  let display = "—";
  if (typeof value === "boolean") display = value ? "Yes" : "No";
  else if (typeof value === "string" && value) display = value;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
      <span className="text-sm text-slate-600">{num}. {label}</span>
      <span className="text-sm text-slate-900">{display}</span>
    </div>
  );
}

function SectionCard({ title, count, onAdd, children }: {
  title: string; count?: number; onAdd?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</h3>
          {count !== undefined && <span className="text-xs text-slate-400">{count} total</span>}
        </div>
        {onAdd && (
          <Button size="sm" onClick={onAdd} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1 h-7 text-xs px-2.5">
            <Plus className="h-3 w-3" /> Add
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = true, children }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-lg">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// Lightweight wrapper for assessors — no sidebar, no redirect
function AssessorDetailLayout({ children, backHref }: { children: React.ReactNode; backHref: string }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <Link href={backHref}>
          <button className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to My Clients
          </button>
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-sm font-medium text-slate-700">FreshSelect Meals — Client Detail</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function AdminClientDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id || "0");
  const utils = trpc.useUtils();
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { openDocument, loading: docOpenLoading } = useOpenDocument();
  const isAssessor = user?.role === "assessor";
  // Detect if this page was opened from the org portal (/org/clients/:id)
  const isOrgContext = location.startsWith("/org/") || !!(user as any)?.orgId;

  const { data: client, isLoading } = trpc.admin.getById.useQuery({ id }, { enabled: id > 0 });
  const { data: notes } = trpc.admin.notes.byClient.useQuery({ submissionId: id }, { enabled: id > 0 });
  const { data: tasks } = trpc.admin.tasks.byClient.useQuery({ submissionId: id }, { enabled: id > 0 });
  const { data: clientServices } = trpc.admin.services.byClient.useQuery({ submissionId: id }, { enabled: id > 0 });
  const { data: clientDocs } = trpc.admin.documents.byClient.useQuery({ submissionId: id }, { enabled: id > 0 });
  const staffQuery = trpc.admin.staffList.useQuery();
  const { data: assessorList } = trpc.admin.listAssessors.useQuery();
  const { data: orgList = [] } = trpc.org.list.useQuery({ includeInactive: false });
  const { data: stageHistoryData } = trpc.admin.stageHistory.useQuery({ id }, { enabled: id > 0 });

  const [activeTab, setActiveTab] = useState<"overview" | "assessment" | "services" | "activity" | "chat">("overview");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);

  const activityPageSize = 25;
  const { data: activityData, isLoading: activityLoading } = trpc.auditLog.list.useQuery(
    { clientId: id, page: activityPage, pageSize: activityPageSize },
    { enabled: id > 0 && activeTab === "activity" }
  );
  const [noteText, setNoteText] = useState("");
  const [docType, setDocType] = useState("provider_attestation");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Dialog states
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showReferOrg, setShowReferOrg] = useState(false);
  const [referOrgId, setReferOrgId] = useState<string>("");
  const [referOrgNote, setReferOrgNote] = useState("");
  const [showAddHousehold, setShowAddHousehold] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [taskArea, setTaskArea] = useState<"intake_rep" | "assigned_worker">("intake_rep");
  // Assessor assignment state
  const [showReassignWarning, setShowReassignWarning] = useState(false);
  const [pendingAssessorId, setPendingAssessorId] = useState<number | null>(null);

  // Terminal stage confirmation
  const [pendingStageChange, setPendingStageChange] = useState<string | null>(null);
  const TERMINAL_STAGES = ["not_eligible", "ineligible", "level_one_only", "level_one_household", "level_2_active"];
  const handleStageChange = (v: string) => {
    if (TERMINAL_STAGES.includes(v)) {
      setPendingStageChange(v);
    } else {
      updateStageMutation.mutate({ id, stage: v as any });
    }
  };

  // Edit/delete state for household members
  const [editHouseholdIdx, setEditHouseholdIdx] = useState<number | null>(null);
  const [editHouseholdForm, setEditHouseholdForm] = useState({ name: "", dateOfBirth: "", medicaidId: "", relationship: "" });

  // Edit/delete state for addresses
  const [editAddressIdx, setEditAddressIdx] = useState<number | null>(null);
  const [editAddressForm, setEditAddressForm] = useState({ street: "", apt: "", city: "", state: "NY", zip: "" });

  // Edit/delete state for phones
  const [editPhoneIdx, setEditPhoneIdx] = useState<number | null>(null);
  const [editPhoneValue, setEditPhoneValue] = useState("");

  // Edit/delete state for emails
  const [editEmailIdx, setEditEmailIdx] = useState<number | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");

  // Assessment sub-field inline edit state
  const [editMiscarriageDate, setEditMiscarriageDate] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState<string | null>(null);
  const [editInfantMode, setEditInfantMode] = useState(false);
  const [editInfantForm, setEditInfantForm] = useState({ infantName: "", infantDateOfBirth: "", infantMedicaidId: "" });
  const [editConditionIdx, setEditConditionIdx] = useState<string | null>(null);
  const [editConditionName, setEditConditionName] = useState("");
  const [editOtherDesc, setEditOtherDesc] = useState<string | null>(null);

  // Form states for dialogs
  const [editForm, setEditForm] = useState<{
    firstName: string; lastName: string; email: string; cellPhone: string; medicaidId: string;
    language: string; program: string; borough: string; neighborhood: string; supermarket: string; referralSource: string;
    dateOfBirth: string; streetAddress: string; aptUnit: string; city: string; state: string; zipcode: string;
    householdMembers: Array<{ name: string; dateOfBirth: string; medicaidId: string; relationship: string }>;
    // Employment
    employed: string; spouseEmployed: string;
    // Food preferences
    foodAllergies: string; foodAllergiesDetails: string; dietaryRestrictions: string;
    mealFocus: string[]; breakfastItems: string; lunchItems: string; dinnerItems: string; snackItems: string;
    needsRefrigerator: string; needsMicrowave: string; needsCookingUtensils: string;
  }>({
    firstName: "", lastName: "", email: "", cellPhone: "", medicaidId: "",
    language: "", program: "", borough: "", neighborhood: "", supermarket: "", referralSource: "",
    dateOfBirth: "", streetAddress: "", aptUnit: "", city: "", state: "", zipcode: "",
    householdMembers: [],
    employed: "", spouseEmployed: "",
    foodAllergies: "", foodAllergiesDetails: "", dietaryRestrictions: "",
    mealFocus: [], breakfastItems: "", lunchItems: "", dinnerItems: "", snackItems: "",
    needsRefrigerator: "", needsMicrowave: "", needsCookingUtensils: "",
  });
  const [householdForm, setHouseholdForm] = useState({ name: "", dateOfBirth: "", medicaidId: "" });
  const [addressForm, setAddressForm] = useState({ street: "", apt: "", city: "", state: "NY", zip: "" });
  const [phoneForm, setPhoneForm] = useState("");
  const [emailForm, setEmailForm] = useState("");
  const [taskForm, setTaskForm] = useState("");
  const [newServiceName, setNewServiceName] = useState("");

  // Mutations
  const updateClientMutation = trpc.admin.updateClient.useMutation({
    onSuccess: () => { utils.admin.getById.invalidate({ id }); setShowEdit(false); toast.success("Client updated"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteClientMutation = trpc.admin.deleteClient.useMutation({
    onSuccess: () => { toast.success("Client deleted"); navigate("/admin/clients"); },
    onError: (err) => toast.error(err.message),
  });
  const updateStageMutation = trpc.admin.updateStage.useMutation({
    onSuccess: () => { utils.admin.getById.invalidate({ id }); toast.success("Stage updated"); },
  });
  const updateAssignmentMutation = trpc.admin.updateAssignment.useMutation({
    onSuccess: () => { utils.admin.getById.invalidate({ id }); toast.success("Assignment updated"); },
  });
  const assignAssessorMutation = trpc.admin.assignAssessor.useMutation({
    onSuccess: () => { utils.admin.getById.invalidate({ id }); toast.success("Assessor assigned"); setShowReassignWarning(false); setPendingAssessorId(null); },
    onError: (err) => toast.error(err.message),
  });
  const updatePriorityMutation = trpc.admin.updatePriority.useMutation({
    onSuccess: () => { utils.admin.getById.invalidate({ id }); toast.success("Priority updated"); },
  });
  const addNoteMutation = trpc.admin.notes.create.useMutation({
    onSuccess: () => { utils.admin.notes.byClient.invalidate({ submissionId: id }); setNoteText(""); toast.success("Note added"); },
  });
  const addTaskMutation = trpc.admin.tasks.create.useMutation({
    onSuccess: () => { utils.admin.tasks.byClient.invalidate({ submissionId: id }); setShowAddTask(false); setTaskForm(""); toast.success("Task added"); },
  });
  const addServiceMutation = trpc.admin.services.create.useMutation({
    onSuccess: () => { utils.admin.services.byClient.invalidate({ submissionId: id }); setShowAddService(false); setNewServiceName(""); toast.success("Service added"); },
  });
  const uploadDocMutation = trpc.admin.documents.upload.useMutation({
    onSuccess: () => { utils.admin.documents.byClient.invalidate({ submissionId: id }); toast.success("Document uploaded"); },
  });
  const updateTaskStatusMutation = trpc.admin.tasks.updateStatus.useMutation({
    onSuccess: () => { utils.admin.tasks.byClient.invalidate({ submissionId: id }); toast.success("Task status updated"); },
  });

  // Referrer Notes state
  const [referrerNoteText, setReferrerNoteText] = useState("");
  const [referrerNoteAttachmentUrl, setReferrerNoteAttachmentUrl] = useState<string | null>(null);
  const [uploadingReferrerAttachment, setUploadingReferrerAttachment] = useState(false);
  const referrerAttachRef = useRef<HTMLInputElement>(null);
  const { data: referrerNotes } = trpc.admin.listReferrerNotes.useQuery(
    { submissionId: id },
    { enabled: id > 0 }
  );
  const sendReferrerNoteMutation = trpc.admin.sendReferrerNote.useMutation({
    onSuccess: () => {
      utils.admin.listReferrerNotes.invalidate({ submissionId: id });
      setReferrerNoteText("");
      setReferrerNoteAttachmentUrl(null);
      toast.success("Note sent to referrer");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteReferrerNoteMutation = trpc.admin.deleteReferrerNote.useMutation({
    onSuccess: () => {
      utils.admin.listReferrerNotes.invalidate({ submissionId: id });
      toast.success("Note deleted");
    },
    onError: (err) => toast.error(err.message),
  });
  const handleReferrerAttachUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReferrerAttachment(true);
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadDocumentMutation.mutateAsync({
        fileName: file.name, fileData, contentType: file.type || "application/octet-stream", category: "referrer-note",
      });
      setReferrerNoteAttachmentUrl(result.url);
      toast.success(`Attached: ${file.name}`);
    } catch { toast.error("Failed to upload attachment"); }
    finally { setUploadingReferrerAttachment(false); e.target.value = ""; }
  };

  // SCN Assessment editing state
  const [scnEditMode, setScnEditMode] = useState(false);
  const [scnEdits, setScnEdits] = useState<Record<string, string>>({});

  // Health category editing state
  const [hcEditMode, setHcEditMode] = useState(false);
  const [hcEdits, setHcEdits] = useState<string[]>([]);
  const [hcRemoveWarning, setHcRemoveWarning] = useState<{ cat: string; details: string[] } | null>(null);

  // Health condition details editing state
  // conditionEdits: { [conditionKey]: { clientName: string; docUrls: string[] } }
  const [conditionEditMode, setConditionEditMode] = useState(false);
  const [conditionEdits, setConditionEdits] = useState<Record<string, { clientName: string; docUrls: string[] }>>({});
  const [uploadingConditionDoc, setUploadingConditionDoc] = useState<string | null>(null); // conditionKey being uploaded
  const conditionDocInputRef = useRef<HTMLInputElement>(null);
  const [pendingConditionDocKey, setPendingConditionDocKey] = useState<string | null>(null);

  const handleConditionDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, conditionKey: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingConditionDoc(conditionKey);
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadDocumentMutation.mutateAsync({
        fileName: file.name, fileData, contentType: file.type || "application/octet-stream", category: "condition-doc",
      });
      setConditionEdits((prev) => ({
        ...prev,
        [conditionKey]: {
          clientName: prev[conditionKey]?.clientName || "",
          docUrls: [...(prev[conditionKey]?.docUrls || []), result.url],
        },
      }));
      toast.success(`Document uploaded: ${file.name}`);
    } catch { toast.error("Failed to upload document"); }
    finally { setUploadingConditionDoc(null); e.target.value = ""; }
  };
  const updateScreeningMutation = trpc.admin.updateScreeningAnswers.useMutation({
    onSuccess: () => { utils.admin.getById.invalidate({ id }); setScnEditMode(false); setScnEdits({}); setHcEditMode(false); setHcEdits([]); toast.success("Saved"); },
    onError: (err) => toast.error(err.message),
  });

  // Save condition details (client name + docs) via the same updateScreeningAnswers procedure
  const saveConditionDetails = () => {
    // Merge conditionEdits into formData.conditionDetails
    const existingDetails = (fd as any).conditionDetails || {};
    const merged: Record<string, { clientName: string; docUrls: string[] }> = { ...existingDetails };
    for (const [key, val] of Object.entries(conditionEdits)) {
      merged[key] = val;
    }
    updateScreeningMutation.mutate({
      id,
      formData: { conditionDetails: merged },
    }, {
      onSuccess: () => {
        setConditionEditMode(false);
        setConditionEdits({});
        toast.success("Health condition details saved");
      },
    });
  };
  const updateAssessmentCompletedMutation = trpc.admin.updateAssessmentCompleted.useMutation({
    onSuccess: (_data, variables) => {
      utils.admin.getById.invalidate({ id });
      // When marking complete (not incomplete), auto-advance stage to Assessment
      if (variables.completed) {
        updateStageMutation.mutate({ id, stage: "assessment" });
        toast.success("Assessment marked complete — stage updated to Assessment");
      } else {
        toast.success("Assessment marked incomplete");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // Client Email Thread state
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailAttachments, setEmailAttachments] = useState<string[]>([]);
  const [uploadingEmailAttachment, setUploadingEmailAttachment] = useState(false);
  const emailAttachRef = useRef<HTMLInputElement>(null);
  const { data: clientEmailThread, isLoading: emailThreadLoading } = trpc.admin.listClientEmails.useQuery(
    { submissionId: id },
    { enabled: id > 0, refetchInterval: 30000 }
  );
  const deleteClientEmailMutation = trpc.admin.deleteClientEmail.useMutation({
    onSuccess: () => { utils.admin.listClientEmails.invalidate({ submissionId: id }); toast.success("Email deleted"); },
  });

  const sendClientEmailMutation = trpc.admin.sendClientEmail.useMutation({
    onSuccess: () => {
      utils.admin.listClientEmails.invalidate({ submissionId: id });
      setEmailSubject("");
      setEmailBody("");
      setEmailAttachments([]);
      toast.success("Email sent to client");
    },
    onError: (err) => toast.error(err.message || "Failed to send email"),
  });

  const uploadDocumentMutation = trpc.upload.document.useMutation();

  const handleEmailAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingEmailAttachment(true);
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadDocumentMutation.mutateAsync({
        fileName: file.name,
        fileData,
        contentType: file.type || "application/octet-stream",
        category: "email-attachment",
      });
      setEmailAttachments((prev) => [...prev, result.url]);
      toast.success(`Attached: ${file.name}`);
    } catch (err) {
      toast.error("Failed to upload attachment");
    } finally {
      setUploadingEmailAttachment(false);
      if (emailAttachRef.current) emailAttachRef.current.value = "";
    }
  };

  // Admin Notes (Assessment) — pre-populate from loaded client data
  const [adminNotesText, setAdminNotesText] = useState("");
  const [adminNotesChanged, setAdminNotesChanged] = useState(false);
  useEffect(() => {
    if (client && !adminNotesChanged) {
      setAdminNotesText((client as any).adminNotes || "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(client as any)?.adminNotes]);
  const updateAdminNotesMutation = trpc.admin.updateAdminNotes.useMutation({
    onSuccess: () => { utils.admin.getById.invalidate({ id }); setAdminNotesChanged(false); toast.success("Assessment notes saved"); },
    onError: (err) => toast.error(err.message),
  });
  const handleSaveAdminNotes = () => {
    updateAdminNotesMutation.mutate({ id, adminNotes: adminNotesText });
  };

  const referClientMutation = trpc.org.referClient.useMutation({
    onSuccess: () => {
      utils.admin.getById.invalidate({ id });
      setShowReferOrg(false);
      setReferOrgId("");
      setReferOrgNote("");
      toast.success("Client referred to organization");
    },
    onError: (err) => toast.error(err.message),
  });

  const staffList = (staffQuery.data ?? []) as any[];
  const getWorkerName = (wId: number | null) => {
    if (!wId) return null;
    const w = staffList.find((s: any) => s.id === wId);
    return w?.name || `User #${wId}`;
  };

  // Determine back link based on context
  const assessorBackHref = isOrgContext ? "/org" : "/assessor";

  if (isLoading) {
    if (isAssessor) return <AssessorDetailLayout backHref={assessorBackHref}><div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div></AssessorDetailLayout>;
    return <AdminLayout><div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div></AdminLayout>;
  }
  if (!client) {
    if (isAssessor) return <AssessorDetailLayout backHref={assessorBackHref}><div className="p-6 text-center"><p className="text-slate-500">Client not found</p></div></AssessorDetailLayout>;
    return <AdminLayout><div className="p-6 text-center"><p className="text-slate-500">Client not found</p><Link href="/admin/clients"><Button variant="outline" className="mt-4">Back to Clients</Button></Link></div></AdminLayout>;
  }

  const fd = (client as any).formData as any || {};
  // screeningQuestions is the canonical key used by the intake form; screening is the legacy/edited key
  const screening = fd.screeningQuestions || fd.screening || {};

  const healthCategories = fd.healthCategories || [];
  const householdMembers = fd.householdMembers || [];
  const additionalAddresses = fd.additionalAddresses || [];
  const additionalPhones = fd.additionalPhones || [];
  const additionalEmails = fd.additionalEmails || [];

  // ── Assessment completeness validation ───────────────────────────────────
  // Returns array of missing field labels; empty = all answered → button enabled
  const assessmentMissingFields = (() => {
    const missing: string[] = [];
    const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
    if (isBlank(screening.livingSituation)) missing.push("Q1: Living situation");
    if (isBlank(screening.utilityShutoff)) missing.push("Q2: Utility shutoff threat");
    const snapVal = screening.receivesSnap ?? fd.receivesSnap ?? fd.hasSnap;
    if (isBlank(snapVal)) missing.push("Q3: Receives SNAP");
    const wicVal = screening.receivesWic ?? fd.receivesWic ?? fd.hasWic;
    if (isBlank(wicVal)) missing.push("Q4: Receives WIC");
    if (isBlank(screening.receivesTanf)) missing.push("Q5: Receives TANF");
    if (isBlank(screening.enrolledHealthHome)) missing.push("Q6: Enrolled in Health Home");
    const hhCount = screening.householdMembersCount || fd.householdMembersCount || fd.householdMemberCount || screening.householdMemberCount;
    if (isBlank(hhCount)) missing.push("Q7: Household members count");
    if (isBlank(screening.householdMembersWithMedicaid)) missing.push("Q8: Members with Medicaid");
    if (isBlank(screening.needsWorkAssistance)) missing.push("Q9: Needs work assistance");
    const schoolVal = screening.wantsSchoolHelp ?? screening.wantsSchoolTraining ?? fd.wantsSchoolHelp ?? fd.wantsSchoolTraining;
    if (isBlank(schoolVal)) missing.push("Q10: Wants school/training help");
    if (isBlank(screening.transportationBarrier)) missing.push("Q11: Transportation barrier");
    if (isBlank(screening.hasChronicIllness)) missing.push("Q12: Has chronic illness");
    if (isBlank(screening.otherHealthIssues)) missing.push("Q13: Other health issues");
    if (isBlank(screening.medicationsRequireRefrigeration)) missing.push("Q14: Medications require refrigeration");
    const pregnantVal2 = screening.pregnantOrPostpartum ||
      (healthCategories.includes("Pregnant") || healthCategories.some((c: string) => c.startsWith("Postpartum")) ? "Yes" : undefined);
    if (isBlank(pregnantVal2)) missing.push("Q15: Pregnant or postpartum");
    if (String(pregnantVal2).toLowerCase() === "yes" || pregnantVal2 === true) {
      const dueDateVal = fd.dueDate || screening.dueDate;
      if (isBlank(dueDateVal)) missing.push("Due date (required when pregnant/postpartum)");
    }
    if (isBlank(screening.breastmilkRefrigeration)) missing.push("Q16: Breastmilk refrigeration needed");
    if (isBlank(fd.foodAllergies)) missing.push("Food allergies");
    return missing;
  })();
  const canMarkCompleted = assessmentMissingFields.length === 0;
  const uploadedDocuments = fd.uploadedDocuments || fd.documents || {} as Record<string, string>;

  // Build a human-readable label map for document keys
  const DOC_LABEL_MAP: Record<string, string> = {
    childMedicaidCard_0: "Child Medicaid Card",
    childBirthCertificate_0: "Child Birth Certificate",
    memberMedicaidCard_0: "Member 1 — Medicaid Card",
    memberBirthCertificate_0: "Member 1 — Birth Certificate",
    memberMarriageLicense_0: "Member 1 — Marriage License",
    memberMedicaidCard_1: "Member 2 — Medicaid Card",
    memberBirthCertificate_1: "Member 2 — Birth Certificate",
    memberMarriageLicense_1: "Member 2 — Marriage License",
    memberMedicaidCard_2: "Member 3 — Medicaid Card",
    memberBirthCertificate_2: "Member 3 — Birth Certificate",
    memberMarriageLicense_2: "Member 3 — Marriage License",
    memberMedicaidCard_3: "Member 4 — Medicaid Card",
    memberBirthCertificate_3: "Member 4 — Birth Certificate",
    memberMarriageLicense_3: "Member 4 — Marriage License",
    memberMedicaidCard_4: "Member 5 — Medicaid Card",
    memberBirthCertificate_4: "Member 5 — Birth Certificate",
    memberMarriageLicense_4: "Member 5 — Marriage License",
  };
  function getDocLabel(key: string): string {
    if (DOC_LABEL_MAP[key]) return DOC_LABEL_MAP[key];
    // Auto-label: memberMedicaidCard_N → Member N+1 — Medicaid Card
    const m = key.match(/^(member|child)([A-Za-z]+)_?(\d+)?$/);
    if (m) {
      const prefix = m[1] === 'child' ? 'Child' : `Member ${parseInt(m[3] || '0') + 1}`;
      const docType = m[2].replace(/([A-Z])/g, ' $1').trim();
      return `${prefix} — ${docType}`;
    }
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
  }

  const stageInfo = STAGE_CONFIG[client.stage] || { label: client.stage, bg: "bg-slate-100", text: "text-slate-700" };
  const isReferral = client.stage === "referral";
  const isAssessment = ["assessment", "level_one_only", "level_one_household", "level_2_active"].includes(client.stage);
  const intakeRepName = getWorkerName(client.intakeRep);

  // Required field completion indicator
  const requiredFields = [
    { label: "Date of Birth", ok: !!fd.dateOfBirth },
    { label: "Phone", ok: !!client.cellPhone },
    { label: "Address", ok: !!fd.streetAddress },
    { label: "Medicaid ID", ok: !!client.medicaidId },
    { label: "Vendor", ok: !!(client as any).supermarket },
    { label: "Language", ok: !!(client as any).language },
  ];
  const completedCount = requiredFields.filter(f => f.ok).length;
  const profileComplete = completedCount === requiredFields.length;

  const intakeRepTasks = (tasks || []).filter((t: any) => t.area === "intake_rep");
  const workerTasks = (tasks || []).filter((t: any) => t.area === "assigned_worker");

  const openEditDialog = () => {
    setEditForm({
      firstName: client.firstName || "",
      lastName: client.lastName || "",
      email: client.email || "",
      cellPhone: client.cellPhone || "",
      medicaidId: client.medicaidId || "",
      language: (client as any).language || "English",
      program: (client as any).program || "PHS",
      borough: (client as any).borough || "",
      neighborhood: (client as any).neighborhood || "",
      supermarket: (client as any).supermarket || "",
      referralSource: (client as any).referralSource || "",
      dateOfBirth: fd.dateOfBirth ? String(fd.dateOfBirth).split("T")[0] : "",
      streetAddress: fd.streetAddress || "",
      aptUnit: fd.aptUnit || "",
      city: fd.city || "Brooklyn",
      state: fd.state || "NY",
      zipcode: fd.zipcode || "",
      householdMembers: (fd.householdMembers || []).map((m: any) => ({
        name: m.name || "",
        dateOfBirth: m.dateOfBirth || m.dob || "",
        medicaidId: m.medicaidId || "",
        relationship: m.relationship || "",
      })),
      employed: fd.employed || "",
      spouseEmployed: fd.spouseEmployed || "",
      foodAllergies: fd.foodAllergies || "",
      foodAllergiesDetails: fd.foodAllergiesDetails || "",
      dietaryRestrictions: fd.dietaryRestrictions || "",
      mealFocus: fd.mealFocus || [],
      breakfastItems: fd.breakfastItems || "",
      lunchItems: fd.lunchItems || "",
      dinnerItems: fd.dinnerItems || "",
      snackItems: fd.snackItems || "",
      needsRefrigerator: fd.needsRefrigerator || "",
      needsMicrowave: fd.needsMicrowave || "",
      needsCookingUtensils: fd.needsCookingUtensils || "",
    });
    setShowEdit(true);
  };

  const handleEditSave = () => {
    const {
      dateOfBirth, streetAddress, aptUnit, city, state, zipcode, householdMembers,
      employed, spouseEmployed,
      foodAllergies, foodAllergiesDetails, dietaryRestrictions,
      mealFocus, breakfastItems, lunchItems, dinnerItems, snackItems,
      needsRefrigerator, needsMicrowave, needsCookingUtensils,
      ...topLevelFields
    } = editForm;
    updateClientMutation.mutate({
      id,
      ...topLevelFields,
      formData: {
        dateOfBirth, streetAddress, aptUnit, city, state, zipcode, householdMembers,
        employed, spouseEmployed,
        foodAllergies, foodAllergiesDetails, dietaryRestrictions,
        mealFocus, breakfastItems, lunchItems, dinnerItems, snackItems,
        needsRefrigerator, needsMicrowave, needsCookingUtensils,
      },
    });
  };

  const handleAddHousehold = () => {
    if (!householdForm.name.trim()) { toast.error("Name is required"); return; }
    const updated = [...householdMembers, { ...householdForm }];
    updateClientMutation.mutate({ id, additionalMembersCount: updated.length, formData: { householdMembers: updated } }, {
      onSuccess: () => { setShowAddHousehold(false); setHouseholdForm({ name: "", dateOfBirth: "", medicaidId: "" }); toast.success("Household member added"); utils.admin.getById.invalidate({ id }); },
    });
  };

  const handleAddAddress = () => {
    if (!addressForm.street.trim()) { toast.error("Street is required"); return; }
    const updated = [...additionalAddresses, { ...addressForm }];
    updateClientMutation.mutate({ id, formData: { additionalAddresses: updated } }, {
      onSuccess: () => { setShowAddAddress(false); setAddressForm({ street: "", apt: "", city: "", state: "NY", zip: "" }); toast.success("Address added"); utils.admin.getById.invalidate({ id }); },
    });
  };

  const handleAddPhone = () => {
    if (!phoneForm.trim()) { toast.error("Phone number is required"); return; }
    const updated = [...additionalPhones, phoneForm.trim()];
    updateClientMutation.mutate({ id, formData: { additionalPhones: updated } }, {
      onSuccess: () => { setShowAddPhone(false); setPhoneForm(""); toast.success("Phone added"); utils.admin.getById.invalidate({ id }); },
    });
  };

  const handleAddEmail = () => {
    if (!emailForm.trim()) { toast.error("Email is required"); return; }
    const updated = [...additionalEmails, emailForm.trim()];
    updateClientMutation.mutate({ id, formData: { additionalEmails: updated } }, {
      onSuccess: () => { setShowAddEmail(false); setEmailForm(""); toast.success("Email added"); utils.admin.getById.invalidate({ id }); },
    });
  };

  // ── Edit/Delete handlers for Overview lists ─────────────────────────────
  const handleEditHousehold = () => {
    if (editHouseholdIdx === null) return;
    const updated = householdMembers.map((m: any, i: number) =>
      i === editHouseholdIdx ? { ...m, ...editHouseholdForm } : m
    );
    updateClientMutation.mutate({ id, formData: { householdMembers: updated } }, {
      onSuccess: () => { setEditHouseholdIdx(null); utils.admin.getById.invalidate({ id }); toast.success("Member updated"); },
    });
  };

  const handleDeleteHousehold = (idx: number) => {
    const updated = householdMembers.filter((_: any, i: number) => i !== idx);
    updateClientMutation.mutate({ id, additionalMembersCount: updated.length, formData: { householdMembers: updated } }, {
      onSuccess: () => { utils.admin.getById.invalidate({ id }); toast.success("Member removed"); },
    });
  };

  const handleEditAddress = () => {
    if (editAddressIdx === null) return;
    const updated = additionalAddresses.map((a: any, i: number) =>
      i === editAddressIdx ? { ...editAddressForm } : a
    );
    updateClientMutation.mutate({ id, formData: { additionalAddresses: updated } }, {
      onSuccess: () => { setEditAddressIdx(null); utils.admin.getById.invalidate({ id }); toast.success("Address updated"); },
    });
  };

  const handleDeleteAddress = (idx: number) => {
    const updated = additionalAddresses.filter((_: any, i: number) => i !== idx);
    updateClientMutation.mutate({ id, formData: { additionalAddresses: updated } }, {
      onSuccess: () => { utils.admin.getById.invalidate({ id }); toast.success("Address removed"); },
    });
  };

  const handleEditPhone = () => {
    if (editPhoneIdx === null) return;
    const updated = additionalPhones.map((p: string, i: number) => i === editPhoneIdx ? editPhoneValue : p);
    updateClientMutation.mutate({ id, formData: { additionalPhones: updated } }, {
      onSuccess: () => { setEditPhoneIdx(null); utils.admin.getById.invalidate({ id }); toast.success("Phone updated"); },
    });
  };

  const handleDeletePhone = (idx: number) => {
    const updated = additionalPhones.filter((_: string, i: number) => i !== idx);
    updateClientMutation.mutate({ id, formData: { additionalPhones: updated } }, {
      onSuccess: () => { utils.admin.getById.invalidate({ id }); toast.success("Phone removed"); },
    });
  };

  const handleEditEmail = () => {
    if (editEmailIdx === null) return;
    const updated = additionalEmails.map((e: string, i: number) => i === editEmailIdx ? editEmailValue : e);
    updateClientMutation.mutate({ id, formData: { additionalEmails: updated } }, {
      onSuccess: () => { setEditEmailIdx(null); utils.admin.getById.invalidate({ id }); toast.success("Email updated"); },
    });
  };

  const handleDeleteEmail = (idx: number) => {
    const updated = additionalEmails.filter((_: string, i: number) => i !== idx);
    updateClientMutation.mutate({ id, formData: { additionalEmails: updated } }, {
      onSuccess: () => { utils.admin.getById.invalidate({ id }); toast.success("Email removed"); },
    });
  };

  // ── Assessment sub-field save handlers ───────────────────────────────────
  const handleSaveMiscarriageDate = () => {
    if (editMiscarriageDate === null) return;
    updateClientMutation.mutate({ id, formData: { miscarriageDate: editMiscarriageDate } }, {
      onSuccess: () => { setEditMiscarriageDate(null); utils.admin.getById.invalidate({ id }); toast.success("Miscarriage date updated"); },
    });
  };

  const handleSaveDueDate = () => {
    if (editDueDate === null) return;
    updateClientMutation.mutate({ id, formData: { dueDate: editDueDate } }, {
      onSuccess: () => { setEditDueDate(null); utils.admin.getById.invalidate({ id }); toast.success("Due date updated"); },
    });
  };

  const handleSaveInfant = () => {
    updateClientMutation.mutate({ id, formData: { ...editInfantForm } }, {
      onSuccess: () => { setEditInfantMode(false); utils.admin.getById.invalidate({ id }); toast.success("Infant info updated"); },
    });
  };

  const handleSaveConditionName = (conditionKey: string) => {
    const existingConditionDetails = (fd as any).conditionDetails || {};
    const existingConditionClientNames = (fd as any).conditionClientNames || {};
    const updatedConditionDetails = {
      ...existingConditionDetails,
      [conditionKey]: { ...(existingConditionDetails[conditionKey] || {}), clientName: editConditionName },
    };
    const updatedConditionClientNames = { ...existingConditionClientNames, [conditionKey]: editConditionName };
    updateClientMutation.mutate({ id, formData: { conditionDetails: updatedConditionDetails, conditionClientNames: updatedConditionClientNames } }, {
      onSuccess: () => { setEditConditionIdx(null); utils.admin.getById.invalidate({ id }); toast.success("Condition name updated"); },
    });
  };

  const handleSaveOtherDesc = () => {
    if (editOtherDesc === null) return;
    updateClientMutation.mutate({ id, formData: { otherHealthCategoryDetails: editOtherDesc } }, {
      onSuccess: () => { setEditOtherDesc(null); utils.admin.getById.invalidate({ id }); toast.success("Description updated"); },
    });
  };

  const handleAddTask = () => {
    if (!taskForm.trim()) { toast.error("Task description is required"); return; }
    addTaskMutation.mutate({ submissionId: id, title: taskForm.trim().slice(0, 80), description: taskForm.trim(), area: taskArea });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadDocMutation.mutate({ submissionId: id, name: file.name, category: docType as any, fileData: base64, contentType: file.type });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const cycleTaskStatus = (taskId: number, currentStatus: string) => {
    const next = currentStatus === "open" ? "completed" : currentStatus === "completed" ? "verified" : "open";
    updateTaskStatusMutation.mutate({ id: taskId, status: next as any });
  };

  // Use AssessorDetailLayout for assessors (no sidebar redirect), AdminLayout for everyone else
  const PageWrapper = isAssessor
    ? ({ children }: { children: React.ReactNode }) => <AssessorDetailLayout backHref={assessorBackHref}>{children}</AssessorDetailLayout>
    : ({ children }: { children: React.ReactNode }) => <AdminLayout>{children}</AdminLayout>;

  return (
    <PageWrapper>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <button
              className="mt-1.5 text-slate-400 hover:text-slate-600"
              onClick={() => {
                // Use the URL saved by AdminClients when the row was clicked.
                // This is more reliable than history.back() in a wouter SPA
                // because filter changes use replaceState and may not be in the stack.
                const returnUrl = sessionStorage.getItem("adminClients.returnUrl");
                if (returnUrl) {
                  sessionStorage.removeItem("adminClients.returnUrl");
                  navigate(returnUrl);
                } else {
                  navigate("/admin/clients");
                }
              }}
              aria-label="Back to clients"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{client.firstName} {client.lastName}</h1>
                <Badge className={`${stageInfo.bg} ${stageInfo.text} text-xs font-medium border-0`}>{stageInfo.label}</Badge>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">Carebridge</p>
              {client.referralSource && (
                <div className="flex items-center gap-1 mt-0.5 text-xs text-blue-600">
                  <Link2 className="h-3 w-3" />
                  <span>Referred via: <strong>{client.referralSource}</strong></span>
                </div>
              )}
              {/* Assessor decision */}
              {client.status === "approved" && (client as any).approvedBy && (
                <div className="flex items-center gap-1 mt-0.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 w-fit">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Approved by <strong>{(client as any).approvedBy}</strong>{(client as any).approvedAt ? ` on ${new Date((client as any).approvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}</span>
                </div>
              )}
              {client.status === "rejected" && (client as any).rejectedBy && (
                <div className="flex items-center gap-1 mt-0.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5 w-fit">
                  <XCircle className="h-3 w-3" />
                  <span>Rejected by <strong>{(client as any).rejectedBy}</strong>{(client as any).rejectionReason ? ` — ${(client as any).rejectionReason}` : ""}</span>
                </div>
              )}
              {(client as any).stage === "missing_information" && (client as any).missingInfoNote && (
                <div className="flex items-start gap-1.5 mt-1 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 max-w-sm">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span><strong>Missing Info:</strong> {(client as any).missingInfoNote}</span>
                </div>
              )}
              {(client as any).stage === "not_eligible" && (client as any).notEligibleReason && (
                <div className="flex items-start gap-1.5 mt-1 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 max-w-sm">
                  <Ban className="h-3 w-3 mt-0.5 shrink-0" />
                  <span><strong>Not Eligible:</strong> {(client as any).notEligibleReason}</span>
                </div>
              )}
              {/* Profile completion indicator */}
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex items-center gap-1">
                  {requiredFields.map((f) => (
                    <span key={f.label} title={f.ok ? `${f.label}: complete` : `${f.label}: missing`}
                      className={`h-2 w-5 rounded-sm ${f.ok ? "bg-emerald-400" : "bg-slate-200"}`} />
                  ))}
                </div>
                {profileComplete ? (
                  <span className="text-xs text-emerald-600 font-medium">Profile complete</span>
                ) : (
                  <span className="text-xs text-amber-600 font-medium">
                    {completedCount}/{requiredFields.length} fields — missing: {requiredFields.filter(f => !f.ok).map(f => f.label).join(", ")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-slate-500">
                <span>Intake Rep: <strong className="text-slate-700">{intakeRepName || "—"}</strong></span>
                <span className="flex items-center gap-1.5">
                  Priority:
                  <Select
                    value={(client as any).priority || "normal"}
                    onValueChange={(v) => updatePriorityMutation.mutate({ id, priority: v as any })}
                  >
                    <SelectTrigger className="h-7 w-[110px] text-xs border-slate-300"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">🔴 Urgent</SelectItem>
                      <SelectItem value="high">🟠 High</SelectItem>
                      <SelectItem value="normal">🟢 Normal</SelectItem>
                      <SelectItem value="low">⚪ Low</SelectItem>
                    </SelectContent>
                  </Select>
                </span>
                <span className="flex items-center gap-1.5">
                  Assigned Worker:
                  <Select
                    value={client.assignedTo ? String(client.assignedTo) : "unassigned"}
                    onValueChange={(v) => updateAssignmentMutation.mutate({ id, assignedTo: v === "unassigned" ? null : parseInt(v) })}
                  >
                    <SelectTrigger className="h-7 w-[140px] text-xs border-slate-300"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {staffList.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name || `User #${s.id}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </span>
                {(assessorList ?? []).length > 0 && (
                  <span className="flex items-center gap-1.5">
                    Assessor:
                    <Select
                      value={(client as any).assessorId ? String((client as any).assessorId) : "unassigned"}
                      onValueChange={(v) => {
                        const newId = v === "unassigned" ? null : parseInt(v);
                        const currentId = (client as any).assessorId ?? null;
                        if (currentId && newId && currentId !== newId) {
                          // Switching from one assessor to another — show warning
                          setPendingAssessorId(newId);
                          setShowReassignWarning(true);
                        } else if (currentId && newId === null) {
                          // Removing assessor — confirm before unassigning
                          setPendingAssessorId(null);
                          setShowReassignWarning(true);
                        } else {
                          assignAssessorMutation.mutate({ submissionId: id, assessorId: newId });
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 w-[140px] text-xs border-indigo-300 text-indigo-700"><SelectValue placeholder="Assign Assessor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {(assessorList ?? []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name || a.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 h-8"
              disabled={pdfLoading}
              onClick={async () => {
                setPdfLoading(true);
                try {
                  await generateClientPdf({
                    client,
                    notes: (notes as any[]) || [],
                    tasks: (tasks as any[]) || [],
                    services: (clientServices as any[]) || [],
                    stageHistory: (stageHistoryData as any[]) || [],
                    staffName: (wId: number | null | undefined) => getWorkerName(wId ?? null) || "-",
                  });
                } catch (err) {
                  console.error("[PDF] generation failed:", err);
                  const msg = err instanceof Error ? err.message : String(err);
                  toast.error(`Failed to generate PDF: ${msg.slice(0, 120)}`);
                } finally {
                  setPdfLoading(false);
                }
              }}
            >
              {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {pdfLoading ? "Generating..." : "Download PDF"}
            </Button>
            {!isAssessor && (
              <Button variant="outline" size="sm" className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50 h-8" onClick={() => setShowReferOrg(true)}>
                <Link2 className="h-3.5 w-3.5" /> Refer to Org
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 text-slate-600 h-8" onClick={openEditDialog}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0" onClick={() => setShowDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Intake Journey */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Intake Journey</h3>
          <div className="flex items-center">
            <div className="flex flex-col items-center">
              <button onClick={() => updateStageMutation.mutate({ id, stage: "referral" })} className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${isReferral || isAssessment ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>1</button>
              <span className={`text-xs mt-1.5 ${isReferral ? "font-semibold text-emerald-700" : "text-slate-500"}`}>Referral</span>
            </div>
            <div className={`flex-1 h-0.5 mx-2 ${isAssessment ? "bg-emerald-500" : "bg-slate-200"}`} />
            <div className="flex flex-col items-center">
              <button onClick={() => updateStageMutation.mutate({ id, stage: "assessment" })} className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${isAssessment ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>2</button>
              <span className={`text-xs mt-1.5 ${isAssessment ? "font-semibold text-emerald-700" : "text-slate-500"}`}>Assessment</span>
            </div>
            <div className="flex-1 h-0.5 mx-2 bg-slate-200" />
            <div className="flex flex-col items-center">
              <Select value={client.stage} onValueChange={handleStageChange}>
                <SelectTrigger className="h-10 w-[180px] text-xs bg-slate-100 border-slate-200"><SelectValue placeholder="Select Outcome" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STAGE_CONFIG).map(([key, { label }]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs mt-1.5 text-slate-500">Outcome</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
                    {(["overview", "assessment", "services", "activity", "chat"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab ? "border-emerald-500 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab === "activity" && <Activity className="h-3.5 w-3.5" />}
              {tab === "chat" && <MessageSquare className="h-3.5 w-3.5" />}
              {tab === "overview" ? "Overview" : tab === "assessment" ? "Assessment" : tab === "services" ? "Services" : tab === "activity" ? "Activity" : "Chat"}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-5">
              <SectionCard title="Client Information">
                <InfoLine label="CIN ID" value={client.medicaidId} />
                <InfoLine label="Date of Birth" value={formatLocalDate(fd.dateOfBirth)} />
                <InfoLine label="Phone" value={client.cellPhone} />
                <InfoLine label="Address" value={[fd.streetAddress, fd.aptUnit, fd.city || "Brooklyn", fd.state || "NY", fd.zipcode].filter(Boolean).join(" ")} />
                <InfoLine label="Language" value={(client as any).language || "English"} />
                <InfoLine label="Program" value={(client as any).program || "PHS"} />
                <InfoLine label="Vendor" value={(client as any).supermarket} />
                {client.referralSource && <InfoLine label="Referred By" value={client.referralSource} />}
              </SectionCard>

              <SectionCard title="Household Members" count={householdMembers.length} onAdd={() => setShowAddHousehold(true)}>
                {householdMembers.length > 0 ? (
                  <div className="space-y-2">
                    {householdMembers.map((m: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{m.name || `Member ${i + 1}`}</p>
                            <div className="flex gap-4 mt-1 text-xs text-slate-500">
                              <span>DOB: {m.dateOfBirth || m.dob || "—"}</span>
                              <span>Medicaid: {m.medicaidId || "—"}</span>
                              {m.relationship && <span>Rel: {m.relationship}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0 ml-2">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600" onClick={() => { setEditHouseholdIdx(i); setEditHouseholdForm({ name: m.name || "", dateOfBirth: m.dateOfBirth || m.dob || "", medicaidId: m.medicaidId || "", relationship: m.relationship || "" }); }}><Pencil className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-red-600" onClick={() => handleDeleteHousehold(i)} disabled={updateClientMutation.isPending}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-400">No household members linked</p>}
              </SectionCard>

              <SectionCard title="Addresses" onAdd={() => setShowAddAddress(true)}>
                {additionalAddresses.length > 0 ? (
                  <div className="space-y-2">
                    {additionalAddresses.map((a: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm text-slate-700">{a.street} {a.apt && `Apt ${a.apt}`}</p>
                            <p className="text-xs text-slate-500">{a.city}, {a.state} {a.zip}</p>
                          </div>
                          <div className="flex gap-1 shrink-0 ml-2">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600" onClick={() => { setEditAddressIdx(i); setEditAddressForm({ street: a.street || "", apt: a.apt || "", city: a.city || "", state: a.state || "NY", zip: a.zip || "" }); }}><Pencil className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-red-600" onClick={() => handleDeleteAddress(i)} disabled={updateClientMutation.isPending}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-400">No additional addresses. Click Add to create one.</p>}
              </SectionCard>

              <SectionCard title="Additional Phones" onAdd={() => setShowAddPhone(true)}>
                {additionalPhones.length > 0 ? (
                  <div className="space-y-1">
                    {additionalPhones.map((p: string, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                        <span className="text-sm text-slate-700">{p}</span>
                        <div className="flex gap-1 shrink-0 ml-2">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600" onClick={() => { setEditPhoneIdx(i); setEditPhoneValue(p); }}><Pencil className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-red-600" onClick={() => handleDeletePhone(i)} disabled={updateClientMutation.isPending}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-400">No additional phone numbers. Click Add to create one.</p>}
              </SectionCard>

              <SectionCard title="Email Addresses" onAdd={() => setShowAddEmail(true)}>
                {client.email && <p className="text-sm text-slate-700 p-2 rounded bg-slate-50 border border-slate-100 mb-1">{client.email} <span className="text-xs text-slate-400">(primary)</span></p>}
                {additionalEmails.length > 0 && additionalEmails.map((e: string, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100 mb-1">
                    <span className="text-sm text-slate-700">{e}</span>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600" onClick={() => { setEditEmailIdx(i); setEditEmailValue(e); }}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-red-600" onClick={() => handleDeleteEmail(i)} disabled={updateClientMutation.isPending}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
                {!client.email && additionalEmails.length === 0 && <p className="text-sm text-slate-400">No email addresses. Click Add to create one.</p>}
              </SectionCard>

              {/* Employment */}
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employment</h3>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500 gap-1" onClick={() => openEditDialog()}><Pencil className="h-3 w-3" /> Edit</Button>
                </div>
                <InfoLine label="Client Employed" value={fd.employed || "—"} />
                <InfoLine label="Spouse Employed" value={fd.spouseEmployed || "—"} />
              </div>

              {/* Food Preferences */}
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Food Preferences</h3>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500 gap-1" onClick={() => openEditDialog()}><Pencil className="h-3 w-3" /> Edit</Button>
                </div>
                <InfoLine label="Food Allergies" value={fd.foodAllergies || "—"} />
                {fd.foodAllergies === "Yes" && fd.foodAllergiesDetails && <InfoLine label="Allergy Details" value={fd.foodAllergiesDetails} />}
                <InfoLine label="Dietary Restrictions" value={fd.dietaryRestrictions || "—"} />
                {fd.mealFocus && (fd.mealFocus as string[]).length > 0 && <InfoLine label="Meal Focus" value={(fd.mealFocus as string[]).join(", ")} />}
                {fd.breakfastItems && <InfoLine label="Breakfast" value={fd.breakfastItems} />}
                {fd.lunchItems && <InfoLine label="Lunch" value={fd.lunchItems} />}
                {fd.dinnerItems && <InfoLine label="Dinner" value={fd.dinnerItems} />}
                {fd.snackItems && <InfoLine label="Snacks" value={fd.snackItems} />}
                <InfoLine label="Needs Refrigerator" value={fd.needsRefrigerator || "—"} />
                <InfoLine label="Needs Microwave" value={fd.needsMicrowave || "—"} />
                <InfoLine label="Needs Cooking Utensils" value={fd.needsCookingUtensils || "—"} />
              </div>
            </div>

            <div className="space-y-5">
              {/* Services */}
              <SectionCard title="Services">
                <div className="flex justify-end -mt-2 mb-2">
                  <span className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer" onClick={() => setActiveTab("services")}>View All</span>
                </div>
                {clientServices && (clientServices as any[]).length > 0 ? (
                  <div className="space-y-2">
                    {(clientServices as any[]).slice(0, 3).map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                        <span className="text-sm text-slate-700">{s.name}</span>
                        <Badge className={`text-[10px] ${s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{s.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No active services. Add one from the Services tab.</p>
                  </div>
                )}
              </SectionCard>

              {/* Tasks & Action Items */}
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tasks & Action Items</h3>
                <CollapsibleSection title={`Intake Rep Tasks → ${intakeRepName || "Unassigned"}`}>
                  {intakeRepTasks.length > 0 ? (
                    <div className="space-y-2">
                      {intakeRepTasks.map((t: any) => {
                        const isOverdue = t.status !== "completed" && t.status !== "verified" && t.dueDate && new Date(t.dueDate) < new Date();
                        return (
                          <div key={t.id} className={`flex items-start justify-between p-2 rounded border ${isOverdue ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-100"}`}>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-slate-700 block">{t.title || t.description}</span>
                              {t.dueDate && <span className={`text-[11px] ${isOverdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>{isOverdue ? "⚠ Overdue: " : "Due: "}{new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                            </div>
                            <Badge className={`text-[10px] cursor-pointer ml-2 shrink-0 ${t.status === "completed" ? "bg-emerald-100 text-emerald-700" : t.status === "verified" ? "bg-blue-100 text-blue-700" : isOverdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`} onClick={() => cycleTaskStatus(t.id, t.status)}>
                              {t.status}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-sm text-slate-400">No tasks yet.</p>}
                  <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 gap-1 mt-2 h-7 text-xs px-2" onClick={() => { setTaskArea("intake_rep"); setShowAddTask(true); }}>
                    <Plus className="h-3 w-3" /> Add Task
                  </Button>
                </CollapsibleSection>
                <div className="mt-3">
                  <CollapsibleSection title="Assigned Worker Tasks">
                    {workerTasks.length > 0 ? (
                      <div className="space-y-2">
                        {workerTasks.map((t: any) => {
                          const isOverdue = t.status !== "completed" && t.status !== "verified" && t.dueDate && new Date(t.dueDate) < new Date();
                          return (
                            <div key={t.id} className={`flex items-start justify-between p-2 rounded border ${isOverdue ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-100"}`}>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-slate-700 block">{t.title || t.description}</span>
                                {t.dueDate && <span className={`text-[11px] ${isOverdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>{isOverdue ? "⚠ Overdue: " : "Due: "}{new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                              </div>
                              <Badge className={`text-[10px] cursor-pointer ml-2 shrink-0 ${t.status === "completed" ? "bg-emerald-100 text-emerald-700" : t.status === "verified" ? "bg-blue-100 text-blue-700" : isOverdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`} onClick={() => cycleTaskStatus(t.id, t.status)}>
                                {t.status}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    ) : <p className="text-sm text-slate-400">No tasks yet.</p>}
                    <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 gap-1 mt-2 h-7 text-xs px-2" onClick={() => { setTaskArea("assigned_worker"); setShowAddTask(true); }}>
                      <Plus className="h-3 w-3" /> Add Task
                    </Button>
                  </CollapsibleSection>
                </div>
              </div>

              {/* Case Notes */}
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Case Notes</h3>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1 h-7 text-xs px-2.5" onClick={() => { if (noteText.trim()) addNoteMutation.mutate({ submissionId: id, content: noteText.trim() }); }} disabled={!noteText.trim() || addNoteMutation.isPending}>
                    <Plus className="h-3 w-3" /> Add Note
                  </Button>
                </div>
                <Textarea placeholder="Add a case note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="text-sm min-h-[60px] mb-3" />
                {notes && (notes as any[]).length > 0 ? (
                  <div className="space-y-2">
                    {(notes as any[]).map((note: any) => (
                      <div key={note.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <p className="text-sm text-slate-700">{note.content}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                          <span>{note.authorName || "Staff"}</span><span>&middot;</span>
                          <span>{new Date(note.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-400">No notes yet.</p>}
              </div>

              {/* Referrer Notes */}
              {(client as any).referralSource && (
                <div className="bg-white rounded-lg border border-amber-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="h-4 w-4 text-amber-600" />
                    <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Referrer Notes</h3>
                    <span className="text-xs text-slate-400">Visible to referrer</span>
                  </div>
                  {/* Thread log */}
                  {referrerNotes && (referrerNotes as any[]).length > 0 ? (
                    <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                      {(referrerNotes as any[]).map((note: any) => (
                        <div key={note.id} className={`p-3 rounded-lg border text-sm group relative ${
                          note.direction === "referrer"
                            ? "bg-blue-50 border-blue-200 ml-6"
                            : "bg-amber-50 border-amber-100"
                        }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <span className={`text-xs font-semibold block mb-1 ${
                                note.direction === "referrer" ? "text-blue-600" : "text-amber-700"
                              }`}>{note.direction === "referrer" ? "Referrer" : "You"}</span>
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.message}</p>
                              {note.attachmentUrl && (
                                <a href={note.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-xs text-amber-600 hover:underline">
                                  <Paperclip className="w-3 h-3" /> Attachment
                                </a>
                              )}
                              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                                <span>{new Date(note.createdAt).toLocaleString()}</span>
                                {note.readAt && note.direction === "admin" && <span className="text-emerald-600">· Seen</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => deleteReferrerNoteMutation.mutate({ messageId: note.id })}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 p-1 rounded"
                              title="Delete note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-slate-400 mb-3">No notes yet. Use this to request missing info from the referrer.</p>}
                  {/* Compose */}
                  <input ref={referrerAttachRef} type="file" className="hidden" onChange={handleReferrerAttachUpload} />
                  <Textarea
                    placeholder={`Send a note to ${(client as any).referralSource} about this client...`}
                    value={referrerNoteText}
                    onChange={(e) => setReferrerNoteText(e.target.value)}
                    className="text-sm min-h-[60px] border-amber-200 focus:border-amber-400"
                  />
                  {referrerNoteAttachmentUrl && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                        <Paperclip className="w-3 h-3 text-amber-500" /> Attachment ready
                        <button onClick={() => setReferrerNoteAttachmentUrl(null)} className="text-red-400 hover:text-red-600 ml-1">&times;</button>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      type="button" variant="outline" size="sm"
                      className="h-7 text-xs gap-1 border-amber-200 text-amber-600"
                      onClick={() => referrerAttachRef.current?.click()}
                      disabled={uploadingReferrerAttachment}
                    >
                      {uploadingReferrerAttachment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                      Attach
                    </Button>
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white gap-1 h-7 text-xs px-2.5 ml-auto"
                      onClick={() => {
                        if (!referrerNoteText.trim()) return;
                        sendReferrerNoteMutation.mutate({
                          submissionId: id,
                          message: referrerNoteText.trim(),
                          attachmentUrl: referrerNoteAttachmentUrl ?? undefined,
                        });
                      }}
                      disabled={!referrerNoteText.trim() || sendReferrerNoteMutation.isPending}
                    >
                      {sendReferrerNoteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Send to Referrer
                    </Button>
                  </div>
                </div>
              )}

              {/* Client Email Thread */}
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-slate-800">Email Conversation</h3>
                    {client?.email && <span className="text-xs text-slate-400 font-normal">{client.email}</span>}
                    {clientEmailThread && (clientEmailThread as any[]).some((e: any) => e.direction === "inbound") && (
                      <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">
                        <Reply className="w-3 h-3" /> Has Replies
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => utils.admin.listClientEmails.invalidate({ submissionId: id })}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    title="Refresh thread"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!client?.email ? (
                  <div className="px-5 py-8 text-center">
                    <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No email address on file for this client.</p>
                  </div>
                ) : (
                  <>
                    {/* Conversation thread */}
                    <div className="px-4 py-4 space-y-3 max-h-[420px] overflow-y-auto bg-slate-50/40">
                      {emailThreadLoading ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
                      ) : clientEmailThread && (clientEmailThread as any[]).length > 0 ? (
                        (clientEmailThread as any[]).map((email: any) => {
                          const isOutbound = email.direction === "outbound";
                          const timeStr = new Date(email.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
                          return (
                            <div key={email.id} className={`flex flex-col gap-1 group ${isOutbound ? "items-end" : "items-start"}`}>
                              {/* Sender label */}
                              <div className="flex items-center gap-1.5 px-1">
                                {isOutbound ? (
                                  <Send className="w-3 h-3 text-blue-400" />
                                ) : (
                                  <MailOpen className="w-3 h-3 text-emerald-500" />
                                )}
                                <span className={`text-xs font-medium ${isOutbound ? "text-blue-500" : "text-emerald-600"}`}>
                                  {isOutbound ? "You" : client.firstName}
                                </span>
                                <span className="text-xs text-slate-400 flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" /> {timeStr}
                                </span>
                              </div>
                              {/* Bubble */}
                              <div className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${
                                isOutbound
                                  ? "bg-blue-600 text-white rounded-tr-sm"
                                  : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
                              }`}>
                                {/* Subject line (only show if different from previous) */}
                                <p className={`text-xs font-semibold mb-1 ${isOutbound ? "text-blue-200" : "text-slate-500"}`}>
                                  {email.subject}
                                </p>
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{email.body}</p>
                                {email.attachmentUrls && (() => {
                                  try {
                                    const urls = JSON.parse(email.attachmentUrls);
                                    if (urls.length === 0) return null;
                                    return (
                                      <div className="mt-2 flex flex-wrap gap-1 border-t border-white/20 pt-2">
                                        {urls.map((url: string, i: number) => (
                                          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                            className={`inline-flex items-center gap-1 text-xs rounded px-2 py-0.5 ${
                                              isOutbound ? "bg-blue-500 text-blue-100 hover:bg-blue-400" : "bg-slate-100 text-blue-600 hover:bg-slate-200"
                                            }`}>
                                            <Paperclip className="w-3 h-3" /> Attachment {i + 1}
                                          </a>
                                        ))}
                                      </div>
                                    );
                                  } catch { return null; }
                                })()}
                                {/* Delete button */}
                                <button
                                  onClick={() => { if (confirm("Remove this email from the log?")) deleteClientEmailMutation.mutate({ id: email.id }); }}
                                  className={`absolute -top-1.5 ${isOutbound ? "-left-6" : "-right-6"} opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600`}
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-10">
                          <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">No messages yet.</p>
                          <p className="text-xs text-slate-300 mt-1">Send an email below to start the conversation.</p>
                        </div>
                      )}
                    </div>

                    {/* Compose area */}
                    <div className="border-t border-slate-200 bg-white px-4 py-3 space-y-2">
                      <Input
                        placeholder="Subject (optional)"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className="text-sm h-8 border-slate-200 focus:border-blue-400 bg-slate-50"
                      />
                      <Textarea
                        placeholder={`Write a message to ${client.firstName}...`}
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        className="text-sm min-h-[72px] border-slate-200 focus:border-blue-400 bg-slate-50 resize-none"
                      />
                      {emailAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {emailAttachments.map((url, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                              <Paperclip className="w-3 h-3 text-blue-500" />
                              Attachment {i + 1}
                              <button onClick={() => setEmailAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 ml-1">&times;</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input ref={emailAttachRef} type="file" className="hidden" onChange={handleEmailAttachmentUpload} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-slate-200 text-slate-600"
                          onClick={() => emailAttachRef.current?.click()}
                          disabled={uploadingEmailAttachment}
                        >
                          {uploadingEmailAttachment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                          Attach
                        </Button>
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-7 text-xs px-3 ml-auto"
                          disabled={!emailBody.trim() || sendClientEmailMutation.isPending}
                          onClick={() => {
                            if (!emailBody.trim()) return;
                            sendClientEmailMutation.mutate({
                              submissionId: id,
                              subject: emailSubject.trim(),
                              body: emailBody.trim(),
                              attachmentUrls: emailAttachments,
                            });
                          }}
                        >
                          {sendClientEmailMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Send
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Signed Attestation & HIPAA PDF */}
              {clientDocs && (clientDocs as any[]).some((d: any) => d.category === "consent" && d.mimeType === "application/pdf") && (
                <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-emerald-900">Signed Attestation & HIPAA Consent</p>
                        <p className="text-xs text-emerald-600">Auto-generated PDF with electronic signature</p>
                      </div>
                    </div>
                    {(() => {
                      const consentDoc = (clientDocs as any[]).find((d: any) => d.category === "consent" && d.mimeType === "application/pdf");
                      return consentDoc ? (
                        <button
                          onClick={() => openDocument(consentDoc.fileKey, id)}
                          disabled={docOpenLoading === consentDoc.fileKey}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium rounded-md transition-colors"
                        >
                          {docOpenLoading === consentDoc.fileKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />} View PDF
                        </button>
                      ) : null;
                    })()}
                  </div>
                </div>
              )}

              {/* Documents */}
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Documents</h3>
                <div className="flex gap-2 mb-3">
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger className="flex-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((dt) => <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors mb-3">
                  <Upload className="h-6 w-6 text-slate-400 mb-1" />
                  <span className="text-sm text-slate-500">Click to upload documents</span>
                  <span className="text-xs text-slate-400">or drag files here</span>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                </label>
                {uploadDocMutation.isPending && <div className="flex items-center gap-2 text-sm text-blue-600 mb-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</div>}
                {/* Form-submitted documents (uploaded during application) */}
                {Object.keys(uploadedDocuments).length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Submitted with Application</p>
                    <div className="space-y-2">
                      {Object.entries(uploadedDocuments).map(([docKey, docVal]) => {
                        // New format: { url, key } — use fileKey for getFreshUrl
                        // Old format: plain URL string — pass the URL directly to getFreshUrl (server extracts key)
                        const isNewFormat = typeof docVal === "object" && docVal !== null && "key" in docVal;
                        const fileKeyOrUrl = isNewFormat ? (docVal as any).key : (docVal as string);
                        const isOpening = docOpenLoading === fileKeyOrUrl;
                        return (
                          <div key={docKey} className="flex items-center justify-between p-2 rounded bg-emerald-50 border border-emerald-100">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
                              <span className="text-sm text-slate-700 truncate">{getDocLabel(docKey)}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Open button — works for both old (URL) and new (key) formats */}
                              <button
                                onClick={() => openDocument(fileKeyOrUrl, id)}
                                disabled={isOpening}
                                className="p-1 hover:bg-slate-100 rounded disabled:opacity-60"
                                title="Open document"
                              >
                                {isOpening
                                  ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                  : <ExternalLink className="h-4 w-4 text-blue-500 hover:text-blue-600" />}
                              </button>
            
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Admin-uploaded documents */}
                {clientDocs && (clientDocs as any[]).length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Admin Uploads</p>
                    <div className="space-y-2">
                      {(clientDocs as any[]).map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-700">{doc.name}</span>
                          </div>
                          <button
                            onClick={() => openDocument(doc.fileKey, id)}
                            disabled={docOpenLoading === doc.fileKey}
                            className="p-1 hover:bg-slate-100 rounded disabled:opacity-60"
                            title="Open document"
                          >
                            {docOpenLoading === doc.fileKey
                              ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              : <ExternalLink className="h-4 w-4 text-blue-500 hover:text-blue-600" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : Object.keys(uploadedDocuments).length === 0 ? (
                  <p className="text-sm text-slate-400">No documents yet. Upload one above.</p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Stage History Timeline — shown in overview tab, below documents */}
        {activeTab === "overview" && (
          <div className="bg-white rounded-lg border border-slate-200 p-5 mt-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage History &amp; Progress</h3>
              {(() => {
                const terminalStages = ["not_eligible", "ineligible", "level_one_only", "level_one_household", "level_2_active"];
                const isTerminal = terminalStages.includes((client as any)?.stage ?? "");
                const stageRef = (client as any)?.stageUpdatedAt ? new Date((client as any).stageUpdatedAt) : new Date((client as any)?.createdAt ?? Date.now());
                const daysInStage = Math.floor((Date.now() - stageRef.getTime()) / 86_400_000);
                if (isTerminal) return null;
                return (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 ${
                    daysInStage >= 14 ? "bg-red-100 text-red-700" :
                    daysInStage >= 7  ? "bg-amber-100 text-amber-700" :
                    "bg-emerald-50 text-emerald-700"
                  }`}>
                    {daysInStage >= 14 ? "⚠" : daysInStage >= 7 ? "⏱" : "✓"} {daysInStage} day{daysInStage !== 1 ? "s" : ""} in current stage
                  </span>
                );
              })()}
            </div>
            {stageHistoryData && (stageHistoryData as any[]).length > 0 ? (
              <ol className="relative border-l-2 border-slate-200 ml-2 space-y-5">
                {(stageHistoryData as any[]).map((entry: any, idx: number) => {
                  const fromCfg = entry.fromStage ? STAGE_CONFIG[entry.fromStage] : null;
                  const toCfg = STAGE_CONFIG[entry.toStage] || { label: entry.toStage, bg: "bg-slate-100", text: "text-slate-600" };
                  const isLatest = idx === (stageHistoryData as any[]).length - 1;
                  return (
                    <li key={entry.id} className="ml-5 relative">
                      <span className={`absolute -left-[22px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${
                        isLatest ? "bg-blue-500" : "bg-slate-300"
                      }`} />
                      <div className="flex flex-wrap items-center gap-1.5">
                        {fromCfg ? (
                          <>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${fromCfg.bg} ${fromCfg.text}`}>{fromCfg.label}</span>
                            <span className="text-slate-400 text-xs">→</span>
                          </>
                        ) : (
                          idx === 0 && <span className="text-xs text-slate-400 italic">Started at:</span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${toCfg.bg} ${toCfg.text}`}>{toCfg.label}</span>
                        {isLatest && <span className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">Current</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                        <span className="font-medium text-slate-500">{entry.changedByName || "Staff"}</span>
                        <span>&middot;</span>
                        <span>{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-slate-400">No stage changes recorded yet. Changes will appear here automatically when the stage is updated.</p>
            )}
          </div>
        )}

        {/* Assessment Tab */}
        {activeTab === "assessment" && (
          <div className="space-y-5">
            {/* Admin Notes / Assessment Notes */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Assessment Notes</h2>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-7 text-xs px-3"
                  onClick={handleSaveAdminNotes}
                  disabled={updateAdminNotesMutation.isPending || !adminNotesChanged}
                >
                  {updateAdminNotesMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save Notes
                </Button>
              </div>
              <Textarea
                value={adminNotesText}
                onChange={(e) => { setAdminNotesText(e.target.value); setAdminNotesChanged(true); }}
                placeholder="Add assessment notes, observations, or case comments here..."
                className="text-sm resize-none min-h-[120px] border-slate-200"
              />
              {updateAdminNotesMutation.isSuccess && !adminNotesChanged && (
                <p className="text-xs text-emerald-600 mt-1.5">Notes saved successfully.</p>
              )}
            </div>



            {/* Health Categories — editable */}
            {(() => {
              const ALL_HEALTH_CATEGORIES = [
                "Pregnant", "Had a Miscarriage", "Postpartum (Within the last 12 months)",
                "Substance Use Disorder", "HIV / AIDS", "Diabetes", "Hypertension",
                "Serious Mental Illness (SMI)", "Chronic Condition", "Other",
              ];
              const MEDICAL_CONDITIONS = [
                "HIV / AIDS", "Hypertension", "Chronic Condition",
                "Substance Use Disorder", "Diabetes", "Serious Mental Illness (SMI)",
              ];
              const conditionDetails: Record<string, { clientName?: string; docUrl?: string; docUrls?: string[] }> = (fd as any).conditionDetails || {};
              // conditionClientNames is the flat map used by newer form submissions
              const conditionClientNames: Record<string, string> = (fd as any).conditionClientNames || {};
              const activeCategories = hcEditMode ? hcEdits : healthCategories;
              const selectedMedical = activeCategories.filter((c: string) => MEDICAL_CONDITIONS.includes(c));
              const hasPregnant = activeCategories.includes("Pregnant");
              const hasOther = activeCategories.includes("Other");
              const otherDetails = (fd as any).otherHealthCategoryDetails || "";

              return (
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">Health Categories</h2>
                    <div className="flex items-center gap-2">
                      {!hcEditMode ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-slate-300" onClick={() => { setHcEdits([...healthCategories]); setHcEditMode(true); }}>
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs border-slate-300" onClick={() => { setHcEditMode(false); setHcEdits([]); }}>Cancel</Button>
                          <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1" disabled={updateScreeningMutation.isPending}
                            onClick={() => updateScreeningMutation.mutate({ id, formData: { healthCategories: hcEdits } }, { onSuccess: () => { setHcEditMode(false); setHcEdits([]); } })}>
                            {updateScreeningMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Edit mode: checkbox list */}
                  {hcEditMode ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                      {ALL_HEALTH_CATEGORIES.map((cat) => (
                        <label key={cat} className="flex items-center gap-2.5 cursor-pointer select-none p-2 rounded hover:bg-slate-50">
                          <Checkbox
                            checked={hcEdits.includes(cat)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setHcEdits((prev) => [...prev, cat]);
                                return;
                              }
                              // Check for sub-data before removing
                              const subDetails: string[] = [];
                              if (cat === "Pregnant" && fd.dueDate) subDetails.push(`Due date: ${fd.dueDate}`);
                              if (cat === "Had a Miscarriage" && fd.miscarriageDate) subDetails.push(`Miscarriage date: ${fd.miscarriageDate}`);
                              if (cat.startsWith("Postpartum")) {
                                if (fd.infantName) subDetails.push(`Infant name: ${fd.infantName}`);
                                if (fd.infantDateOfBirth) subDetails.push(`Infant DOB: ${fd.infantDateOfBirth}`);
                                if (fd.infantMedicaidId) subDetails.push(`Infant Medicaid ID: ${fd.infantMedicaidId}`);
                              }
                              const MEDICAL_CONDS = ["HIV / AIDS", "Hypertension", "Chronic Condition", "Substance Use Disorder", "Diabetes", "Serious Mental Illness (SMI)"];
                              if (MEDICAL_CONDS.includes(cat)) {
                                const cData = conditionDetails[cat];
                                const cName = cData?.clientName || conditionClientNames[cat];
                                if (cName) subDetails.push(`Client name: ${cName}`);
                                const docs = cData?.docUrls || (cData?.docUrl ? [cData.docUrl] : []);
                                if (docs.length > 0) subDetails.push(`${docs.length} document${docs.length > 1 ? "s" : ""} attached`);
                              }
                              if (subDetails.length > 0) {
                                setHcRemoveWarning({ cat, details: subDetails });
                              } else {
                                setHcEdits((prev) => prev.filter((c) => c !== cat));
                              }
                            }}
                          />
                          <span className="text-sm text-slate-700">{cat}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    /* View mode: badges */
                    <div className="flex flex-wrap gap-2 mb-4">
                      {healthCategories.length > 0 ? healthCategories.map((cat: string) => (
                        <span key={cat} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">{cat}</span>
                      )) : <span className="text-sm text-slate-400 italic">No health categories selected</span>}
                    </div>
                  )}

                  {/* Medical condition sub-sections — read-only, submitted by client */}
                  {selectedMedical.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Condition Details (submitted by client)</p>
                      {selectedMedical.map((condition: string) => {
                        const cKey = condition;
                        const cData = conditionDetails[cKey];
                        // Newer submissions store names in conditionClientNames; older ones in conditionDetails
                        const clientName = cData?.clientName || conditionClientNames[cKey] || "";
                        const docUrls = cData?.docUrls || (cData?.docUrl ? [cData.docUrl] : []);
                        return (
                          <div key={cKey} className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-semibold text-slate-800">{condition}</p>
                              {editConditionIdx !== cKey
                                ? <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-slate-500 gap-1" onClick={() => { setEditConditionIdx(cKey); setEditConditionName(clientName); }}><Pencil className="h-3 w-3" /> Edit</Button>
                                : <div className="flex items-center gap-1">
                                    <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => { const existingConditionDetails = (fd as any).conditionDetails || {}; const existingConditionClientNames = (fd as any).conditionClientNames || {}; const updatedConditionDetails = { ...existingConditionDetails, [cKey]: { ...(existingConditionDetails[cKey] || {}), clientName: editConditionName } }; const updatedConditionClientNames = { ...existingConditionClientNames, [cKey]: editConditionName }; updateClientMutation.mutate({ id, formData: { conditionDetails: updatedConditionDetails, conditionClientNames: updatedConditionClientNames } }, { onSuccess: () => { setEditConditionIdx(null); utils.admin.getById.invalidate({ id }); toast.success("Condition name updated"); } }); }} disabled={updateClientMutation.isPending}>{updateClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}</Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditConditionIdx(null)}>Cancel</Button>
                                  </div>
                              }
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500">Client name</span>
                                {editConditionIdx === cKey
                                  ? <Input value={editConditionName} onChange={(e) => setEditConditionName(e.target.value)} className="h-7 text-sm w-48" placeholder="Enter client name" />
                                  : <span className={`text-sm ${clientName ? "text-slate-900" : "text-slate-400 italic"}`}>{clientName || "Not provided"}</span>
                                }
                              </div>
                              {docUrls.length > 0 ? (
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {docUrls.map((url: string, i: number) => (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-blue-700 hover:bg-blue-100">
                                      <Paperclip className="w-3 h-3" /> Document {i + 1}
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400 italic mt-1">No documents uploaded</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Had a Miscarriage: miscarriage date */}
                  {activeCategories.includes("Had a Miscarriage") && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/40 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-rose-800">Had a Miscarriage</p>
                        {editMiscarriageDate === null
                          ? <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-slate-500 gap-1" onClick={() => setEditMiscarriageDate((fd as any).miscarriageDate ? String((fd as any).miscarriageDate).split("T")[0] : "")}><Pencil className="h-3 w-3" /> Edit</Button>
                          : <div className="flex items-center gap-1">
                              <Input type="date" value={editMiscarriageDate} onChange={(e) => setEditMiscarriageDate(e.target.value)} className="h-7 text-xs w-36" />
                              <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => updateClientMutation.mutate({ id, formData: { miscarriageDate: editMiscarriageDate } }, { onSuccess: () => { setEditMiscarriageDate(null); utils.admin.getById.invalidate({ id }); toast.success("Miscarriage date updated"); } })} disabled={updateClientMutation.isPending}>{updateClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}</Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditMiscarriageDate(null)}>Cancel</Button>
                            </div>
                        }
                      </div>
                      {editMiscarriageDate === null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">Date of Miscarriage</span>
                          <span className={`text-sm ${(fd as any).miscarriageDate ? "text-slate-900" : "text-slate-400 italic"}`}>
                            {(fd as any).miscarriageDate ? formatLocalDateShort((fd as any).miscarriageDate) : "Not provided"}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pregnant: due date reminder */}
                  {hasPregnant && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-amber-800">Pregnant</p>
                        {editDueDate === null
                          ? <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-slate-500 gap-1" onClick={() => setEditDueDate((fd.dueDate || screening.dueDate || "").split("T")[0])}><Pencil className="h-3 w-3" /> Edit</Button>
                          : <div className="flex items-center gap-1">
                              <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="h-7 text-xs w-36" />
                              <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => updateClientMutation.mutate({ id, formData: { dueDate: editDueDate } }, { onSuccess: () => { setEditDueDate(null); utils.admin.getById.invalidate({ id }); toast.success("Due date updated"); } })} disabled={updateClientMutation.isPending}>{updateClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}</Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditDueDate(null)}>Cancel</Button>
                            </div>
                        }
                      </div>
                      {editDueDate === null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">Due date</span>
                          <span className={`text-sm ${fd.dueDate || screening.dueDate ? "text-slate-900" : "text-red-500 italic"}`}>
                            {fd.dueDate || screening.dueDate ? formatLocalDateShort(fd.dueDate || screening.dueDate) : "Not entered"}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Postpartum: infant sub-fields */}
                  {healthCategories.some((c: string) => c.startsWith("Postpartum")) && (() => {
                    const infantName = fd.infantName || "";
                    const infantDob = fd.infantDateOfBirth || "";
                    const infantMedicaidId = fd.infantMedicaidId || "";
                    const allFilled = infantName && infantDob && infantMedicaidId;
                    return (
                      <div className={`mt-4 rounded-lg border p-4 ${allFilled ? "border-slate-200 bg-slate-50/40" : "border-amber-200 bg-amber-50/40"}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-amber-800">Postpartum — Infant Information</p>
                            {!allFilled && <span className="text-xs text-amber-700 font-medium bg-amber-100 px-2 py-0.5 rounded">Incomplete</span>}
                          </div>
                          {!editInfantMode
                            ? <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-slate-500 gap-1" onClick={() => { setEditInfantForm({ infantName, infantDateOfBirth: infantDob ? infantDob.split("T")[0] : "", infantMedicaidId }); setEditInfantMode(true); }}><Pencil className="h-3 w-3" /> Edit</Button>
                            : <div className="flex items-center gap-1">
                                <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => updateClientMutation.mutate({ id, formData: { ...editInfantForm } }, { onSuccess: () => { setEditInfantMode(false); utils.admin.getById.invalidate({ id }); toast.success("Infant info updated"); } })} disabled={updateClientMutation.isPending}>{updateClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}</Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditInfantMode(false)}>Cancel</Button>
                              </div>
                          }
                        </div>
                        {editInfantMode ? (
                          <div className="space-y-2">
                            <div><Label className="text-xs">Infant Name</Label><Input value={editInfantForm.infantName} onChange={(e) => setEditInfantForm({ ...editInfantForm, infantName: e.target.value })} className="h-8 text-sm" /></div>
                            <div><Label className="text-xs">Infant Date of Birth</Label><Input type="date" value={editInfantForm.infantDateOfBirth} onChange={(e) => setEditInfantForm({ ...editInfantForm, infantDateOfBirth: e.target.value })} className="h-8 text-sm" /></div>
                            <div><Label className="text-xs">Infant Medicaid ID (CIN)</Label><Input value={editInfantForm.infantMedicaidId} onChange={(e) => setEditInfantForm({ ...editInfantForm, infantMedicaidId: e.target.value })} className="h-8 text-sm font-mono" /></div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600">Infant Name</span>
                              <span className={`text-sm ${infantName ? "text-slate-900" : "text-slate-400 italic"}`}>{infantName || "Not provided"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600">Infant Date of Birth</span>
                              <span className={`text-sm ${infantDob ? "text-slate-900" : "text-slate-400 italic"}`}>
                                {infantDob ? formatLocalDateShort(infantDob) : "Not provided"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600">Infant Medicaid ID (CIN)</span>
                              <span className={`text-sm font-mono ${infantMedicaidId ? "text-slate-900" : "text-slate-400 italic"}`}>{infantMedicaidId || "Not provided"}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Other: editable description */}
                  {hasOther && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/40 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-slate-800">Other Health Condition</p>
                        {editOtherDesc === null
                          ? <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-slate-500 gap-1" onClick={() => setEditOtherDesc(otherDetails || "")}><Pencil className="h-3 w-3" /> Edit</Button>
                          : <div className="flex items-center gap-1">
                              <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => updateClientMutation.mutate({ id, formData: { otherHealthCategoryDetails: editOtherDesc } }, { onSuccess: () => { setEditOtherDesc(null); utils.admin.getById.invalidate({ id }); toast.success("Description updated"); } })} disabled={updateClientMutation.isPending}>{updateClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}</Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditOtherDesc(null)}>Cancel</Button>
                            </div>
                        }
                      </div>
                      <div className="space-y-1.5">
                        {editOtherDesc !== null ? (
                          <Textarea value={editOtherDesc} onChange={(e) => setEditOtherDesc(e.target.value)} className="text-sm min-h-[60px]" placeholder="Describe the health condition..." />
                        ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Description</span>
                          <span className={`text-sm ${otherDetails ? "text-slate-900" : "text-slate-400 italic"}`}>
                            {otherDetails || "Not provided"}
                          </span>
                        </div>
                        )}
                        {(() => {
                          const otherDocs = conditionDetails["Other"]?.docUrls || (conditionDetails["Other"]?.docUrl ? [conditionDetails["Other"].docUrl] : []);
                          return otherDocs.length > 0 ? (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {otherDocs.map((url: string, i: number) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-blue-700 hover:bg-blue-100">
                                  <Paperclip className="w-3 h-3" /> Document {i + 1}
                                </a>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">SCN Screening Questionnaire</h2>
              <div className="flex items-center gap-2">
                {!scnEditMode ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-slate-300" onClick={() => {
                    const fd2 = (client.formData as any) || {};
                    // screeningQuestions is the canonical key from the intake form
                    const sc = fd2.screeningQuestions || fd2.screening || {};
                    const hc2 = fd2.healthCategories || [];
                    setScnEdits({
                      screenerName: fd2.screenerName || intakeRepName || "",
                      screeningDate: fd2.screeningDate || (client.createdAt ? new Date(client.createdAt).toISOString().split("T")[0] : ""),
                      livingSituation: String(sc.livingSituation || ""),
                      utilityShutoff: String(sc.utilityShutoff || ""),
                      receivesSnap: String(sc.receivesSnap ?? fd2.receivesSnap ?? fd2.hasSnap ?? ""),
                      receivesWic: String(sc.receivesWic ?? fd2.receivesWic ?? fd2.hasWic ?? ""),
                      receivesTanf: String(sc.receivesTanf || ""),
                      enrolledHealthHome: String(sc.enrolledHealthHome || (hc2.includes("Enrolled in Health Home Care Management") ? "Yes" : "") || ""),
                      // form uses householdMembersCount (plural), not householdMemberCount
                      householdMemberCount: String(sc.householdMembersCount || fd2.householdMembersCount || fd2.householdMemberCount || ""),
                      householdMembersWithMedicaid: String(sc.householdMembersWithMedicaid || ""),
                      needsWorkAssistance: String(sc.needsWorkAssistance || ""),
                      // form uses wantsSchoolHelp, not wantsSchoolTraining
                      wantsSchoolTraining: String(sc.wantsSchoolHelp ?? sc.wantsSchoolTraining ?? ""),
                      transportationBarrier: String(sc.transportationBarrier || ""),
                      hasChronicIllness: String(sc.hasChronicIllness || ""),
                      chronicIllnessDetails: String(sc.chronicIllnessDetails || fd2.chronicIllnessDetails || ""),
                      otherHealthIssues: String(sc.otherHealthIssues || ""),
                      medicationsRequireRefrigeration: String(sc.medicationsRequireRefrigeration || ""),
                      pregnantOrPostpartum: String(sc.pregnantOrPostpartum || (hc2.includes("Pregnant") || hc2.some((c: string) => c.startsWith("Postpartum")) ? "Yes" : "") || ""),
                      dueDate: String(fd2.dueDate || sc.dueDate || ""),
                      breastmilkRefrigeration: String(sc.breastmilkRefrigeration || ""),
                      // Housing & accessibility questions
                      housingPaymentStruggle: String(sc.housingPaymentStruggle || ""),
                      // housingProblems: stored as a single string (dropdown) since Q18 was changed from multi-select.
                      // Legacy data may be an array of comma-split fragments (e.g. ["Pests such as bugs","ants","or mice"]).
                      // Reconstruct by joining and then matching against the known option list.
                      housingProblems: (() => {
                        const HOUSING_OPTIONS = ["No","Pests such as bugs, ants, or mice","Mold","Lead paint or pipes","Lack of heat","Oven or stove not working","Smoke detectors missing or not working","Water leaks"];
                        if (Array.isArray(sc.housingProblems)) {
                          // Try to find a matching option by joining fragments back
                          const joined = sc.housingProblems.join(", ");
                          const match = HOUSING_OPTIONS.find((opt) => joined.includes(opt));
                          return match || "";
                        }
                        const s = String(sc.housingProblems || "");
                        return HOUSING_OPTIONS.includes(s) ? s : "";
                      })(),
                      difficultyClimbingStairs: String(sc.difficultyClimbingStairs || ""),
                      // Food allergies / dietary restrictions (top-level formData fields)
                      foodAllergies: String(fd2.foodAllergies || ""),
                      foodAllergiesDetails: String(fd2.foodAllergiesDetails || ""),
                      dietaryRestrictions: String(fd2.dietaryRestrictions || ""),
                      // Household appliance / cooking needs (top-level formData fields)
                      needsRefrigerator: String(fd2.needsRefrigerator || ""),
                      needsMicrowave: String(fd2.needsMicrowave || ""),
                      needsCookingUtensils: String(fd2.needsCookingUtensils || ""),
                    });
                    setScnEditMode(true);
                  }}>
                    <Pencil className="h-3 w-3" /> Edit Answers
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-slate-300" onClick={() => { setScnEditMode(false); setScnEdits({}); }}>Cancel</Button>
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1" disabled={updateScreeningMutation.isPending} onClick={() => {
                      const { screenerName, screeningDate, dueDate, foodAllergies, foodAllergiesDetails, dietaryRestrictions, ...screeningFields } = scnEdits;
                      // Normalize aliases so both old and new keys are always in sync after save
                      // wantsSchoolTraining (admin key) → also write wantsSchoolHelp (intake form key)
                      if (screeningFields.wantsSchoolTraining !== undefined) {
                        screeningFields.wantsSchoolHelp = screeningFields.wantsSchoolTraining;
                      }
                      // householdMemberCount (admin key) → also write householdMembersCount (intake form key)
                      if (screeningFields.householdMemberCount !== undefined) {
                        screeningFields.householdMembersCount = screeningFields.householdMemberCount;
                      }
                      const { needsRefrigerator, needsMicrowave, needsCookingUtensils, ...remainingScreeningFields } = screeningFields;
                      // housingProblems is now a single string value (dropdown selection)
                      updateScreeningMutation.mutate({ id, formData: { screenerName, screeningDate, dueDate, foodAllergies, foodAllergiesDetails, dietaryRestrictions, needsRefrigerator, needsMicrowave, needsCookingUtensils, screeningQuestions: remainingScreeningFields } });
                    }}>
                      {updateScreeningMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Assessment Completion Toggle */}
            <div className={`flex items-center justify-between p-3 rounded-lg mb-4 border ${
              (client as any).assessmentCompletedAt ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
            }`}>
              <div>
                <p className={`text-sm font-semibold ${ (client as any).assessmentCompletedAt ? "text-emerald-700" : "text-amber-700" }`}>
                  {(client as any).assessmentCompletedAt ? "Assessment Completed" : "Assessment In Progress"}
                </p>
                {(client as any).assessmentCompletedAt && (
                  <p className="text-xs text-emerald-600 mt-0.5">Completed {new Date((client as any).assessmentCompletedAt).toLocaleDateString()}</p>
                )}
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 text-xs ${ (client as any).assessmentCompletedAt ? "border-emerald-300 text-emerald-700 hover:bg-emerald-100" : "border-amber-300 text-amber-700 hover:bg-amber-100" }`}
                        disabled={updateAssessmentCompletedMutation.isPending || (!(client as any).assessmentCompletedAt && !canMarkCompleted)}
                        onClick={() => updateAssessmentCompletedMutation.mutate({ id, completed: !(client as any).assessmentCompletedAt })}
                      >
                        {updateAssessmentCompletedMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : (client as any).assessmentCompletedAt ? "Mark Incomplete" : "Mark Completed"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!(client as any).assessmentCompletedAt && !canMarkCompleted && (
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="font-semibold mb-1 text-xs">Complete all questions first:</p>
                      <ul className="text-xs space-y-0.5">
                        {assessmentMissingFields.map((f) => (
                          <li key={f}>• {f}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="mb-6">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Screening Info</h3>
              {scnEditMode ? (
                <>
                  <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                    <span className="text-sm text-slate-500">Screening Date</span>
                    <Input
                      type="date"
                      className="h-7 text-sm w-44 border-slate-300"
                      value={scnEdits.screeningDate || ""}
                      onChange={(e) => setScnEdits((prev) => ({ ...prev, screeningDate: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
                    <span className="text-sm text-slate-500">Screener Name</span>
                    <Input
                      className="h-7 text-sm w-44 border-slate-300"
                      value={scnEdits.screenerName || ""}
                      onChange={(e) => setScnEdits((prev) => ({ ...prev, screenerName: e.target.value }))}
                      placeholder="Screener name"
                    />
                  </div>
                </>
              ) : (
                <>
                  <InfoLine label="Screening Date" value={((client.formData as any)?.screeningDate) || (client.createdAt ? new Date(client.createdAt).toLocaleDateString() : null)} />
                  <InfoLine label="Screener Name" value={((client.formData as any)?.screenerName) || intakeRepName || "—"} />
                </>
              )}
            </div>

            {/* SCN Screening Questions — dropdowns matching the intake form */}
            {(() => {
              // Helper: Yes/No dropdown row
              const YesNoRow = ({ num, label, field, currentValue }: { num: number; label: string; field: string; currentValue: string | boolean | null | undefined }) => {
                const displayVal = typeof currentValue === "boolean" ? (currentValue ? "Yes" : "No") : (currentValue as string) || "";
                const editVal = scnEdits[field] !== undefined ? scnEdits[field] : displayVal;
                if (!scnEditMode) return <ScreeningLine num={num} label={label} value={currentValue} />;
                return (
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">{num}. {label}</span>
                    <Select value={editVal} onValueChange={(v) => setScnEdits((prev) => ({ ...prev, [field]: v }))}>
                      <SelectTrigger className="h-7 text-sm w-28 border-slate-300">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              };
              // Helper: number input row
              const NumberRow = ({ num, label, field, currentValue }: { num: number; label: string; field: string; currentValue: string | null | undefined }) => {
                const displayVal = (currentValue as string) || "";
                const editVal = scnEdits[field] !== undefined ? scnEdits[field] : displayVal;
                if (!scnEditMode) return <ScreeningLine num={num} label={label} value={currentValue} />;
                return (
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">{num}. {label}</span>
                    <Input
                      type="number" min="0"
                      className="h-7 text-sm w-20 border-slate-300"
                      value={editVal}
                      onChange={(e) => setScnEdits((prev) => ({ ...prev, [field]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                );
              };

              const livingSituationOptions = ["Renting", "Own Home", "Shelter", "Homeless", "Living with Family/Friends", "Other"];
              const livingSitCurrent = String(screening.livingSituation || "");
              const livingSitEdit = scnEdits.livingSituation !== undefined ? scnEdits.livingSituation : livingSitCurrent;

              const pregnantVal = scnEdits.pregnantOrPostpartum !== undefined
                ? scnEdits.pregnantOrPostpartum
                : String(screening.pregnantOrPostpartum || (healthCategories.includes("Pregnant") || healthCategories.some((c: string) => c.startsWith("Postpartum")) ? "Yes" : ""));
              const chronicVal = scnEdits.hasChronicIllness !== undefined
                ? scnEdits.hasChronicIllness
                : String(screening.hasChronicIllness || "");

              return (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Screening Questions</h3>

                  {/* Q1: Living Situation — dropdown with specific options */}
                  {!scnEditMode ? (
                    <ScreeningLine num={1} label="Current living situation" value={screening.livingSituation} />
                  ) : (
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">1. Current living situation</span>
                      <Select value={livingSitEdit} onValueChange={(v) => setScnEdits((prev) => ({ ...prev, livingSituation: v }))}>
                        <SelectTrigger className="h-7 text-sm w-52 border-slate-300">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {livingSituationOptions.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Q2–4: Yes/No */}
                  <YesNoRow num={2} label="Utility shutoff threat (past 12 months)" field="utilityShutoff" currentValue={screening.utilityShutoff} />
                  <YesNoRow num={3} label="Receives SNAP (Food Stamps)" field="receivesSnap" currentValue={fd.receivesSnap ?? fd.hasSnap ?? screening.receivesSnap} />
                  <YesNoRow num={4} label="Receives WIC" field="receivesWic" currentValue={fd.receivesWic ?? fd.hasWic ?? screening.receivesWic} />
                  <YesNoRow num={5} label="Receives TANF" field="receivesTanf" currentValue={screening.receivesTanf} />
                  <YesNoRow num={6} label="Enrolled in Health Home" field="enrolledHealthHome" currentValue={screening.enrolledHealthHome || healthCategories.includes("Enrolled in Health Home Care Management")} />

                  {/* Q7–8: Household counts */}
                  <NumberRow num={7} label="Household members" field="householdMemberCount" currentValue={screening.householdMembersCount || screening.householdMemberCount || fd.householdMembersCount || fd.householdMemberCount || String(householdMembers.length)} />
                  <NumberRow num={8} label="Household members with Medicaid" field="householdMembersWithMedicaid" currentValue={screening.householdMembersWithMedicaid || fd.householdMembersWithMedicaid} />

                  {/* Q9–11: Yes/No */}
                  <YesNoRow num={9} label="Needs work assistance" field="needsWorkAssistance" currentValue={screening.needsWorkAssistance} />
                  <YesNoRow num={10} label="Wants school or training help" field="wantsSchoolTraining" currentValue={screening.wantsSchoolTraining ?? screening.wantsSchoolHelp} />
                  <YesNoRow num={11} label="Transportation barrier (past 12 months)" field="transportationBarrier" currentValue={screening.transportationBarrier} />

                  {/* Q12: Chronic illness — Yes/No + conditional specify */}
                  <YesNoRow num={12} label="Has chronic illness" field="hasChronicIllness" currentValue={screening.hasChronicIllness} />
                  {(scnEditMode ? chronicVal === "Yes" : (screening.hasChronicIllness === "Yes" || screening.hasChronicIllness === true)) && (
                    <div className={`py-2 border-b border-slate-100 ${scnEditMode ? "bg-amber-50/50 px-3 rounded" : ""}`}>
                      {scnEditMode ? (
                        <div className="space-y-1">
                          <Label className="text-xs text-amber-700 font-medium">Please specify chronic condition(s)</Label>
                          <Input
                            className="h-7 text-sm border-amber-200 focus:border-amber-400"
                            value={scnEdits.chronicIllnessDetails !== undefined ? scnEdits.chronicIllnessDetails : String(screening.chronicIllnessDetails || fd.chronicIllnessDetails || "")}
                            onChange={(e) => setScnEdits((prev) => ({ ...prev, chronicIllnessDetails: e.target.value }))}
                            placeholder="e.g. Diabetes, Hypertension, Asthma..."
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500 italic pl-4">Condition(s)</span>
                          <span className="text-sm text-slate-900">{screening.chronicIllnessDetails || fd.chronicIllnessDetails || "—"}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q13–14: Yes/No */}
                  <YesNoRow num={13} label="Other known health issues" field="otherHealthIssues" currentValue={screening.otherHealthIssues} />
                  <YesNoRow num={14} label="Medications require refrigeration" field="medicationsRequireRefrigeration" currentValue={screening.medicationsRequireRefrigeration} />

                  {/* Q15: Pregnant or postpartum — Yes/No + conditional due date */}
                  {!scnEditMode ? (
                    <ScreeningLine num={15} label="Pregnant or postpartum" value={screening.pregnantOrPostpartum || (healthCategories.includes("Pregnant") || healthCategories.some((c: string) => c.startsWith("Postpartum")) ? "Yes" : undefined)} />
                  ) : (
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">15. Pregnant or postpartum</span>
                      <Select value={pregnantVal} onValueChange={(v) => setScnEdits((prev) => ({ ...prev, pregnantOrPostpartum: v }))}>
                        <SelectTrigger className="h-7 text-sm w-28 border-slate-300">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {(scnEditMode ? pregnantVal === "Yes" : (screening.pregnantOrPostpartum === "Yes" || screening.pregnantOrPostpartum === true || healthCategories.includes("Pregnant") || healthCategories.some((c: string) => c.startsWith("Postpartum")))) && (
                    <div className={`py-2 border-b border-slate-100 ${scnEditMode ? "bg-blue-50/50 px-3 rounded" : ""}`}>
                      {scnEditMode ? (
                        <div className="space-y-1">
                          <Label className="text-xs text-blue-700 font-medium">Due date (if pregnant)</Label>
                          <Input
                            type="date"
                            className="h-7 text-sm w-44 border-blue-200 focus:border-blue-400"
                            value={scnEdits.dueDate !== undefined ? scnEdits.dueDate : String(fd.dueDate || screening.dueDate || "")}
                            onChange={(e) => setScnEdits((prev) => ({ ...prev, dueDate: e.target.value }))}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500 italic pl-4">Due date</span>
                          <span className="text-sm text-slate-900">{fd.dueDate || screening.dueDate ? formatLocalDateShort(fd.dueDate || screening.dueDate) : "—"}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q16: Breastmilk refrigeration */}
                  <YesNoRow num={16} label="Breastmilk refrigeration needed" field="breastmilkRefrigeration" currentValue={screening.breastmilkRefrigeration} />

                  {/* Q17: Housing payment struggle */}
                  <YesNoRow num={17} label="Struggles with paying for housing / falling behind on payments" field="housingPaymentStruggle" currentValue={screening.housingPaymentStruggle} />

                  {/* Q18: Housing problems — single dropdown */}
                  {(() => {
                    const HOUSING_PROBLEM_OPTIONS = [
                      "No",
                      "Pests such as bugs, ants, or mice",
                      "Mold",
                      "Lead paint or pipes",
                      "Lack of heat",
                      "Oven or stove not working",
                      "Smoke detectors missing or not working",
                      "Water leaks",
                    ];
                    // Stored value is a string (single selection).
                    // Legacy data may be an array of comma-split fragments — reconstruct by joining and matching.
                    const savedVal: string = (() => {
                      if (Array.isArray(screening.housingProblems)) {
                        const joined = (screening.housingProblems as string[]).join(", ");
                        const match = HOUSING_PROBLEM_OPTIONS.find((opt) => joined.includes(opt));
                        return match || "";
                      }
                      const s = String(screening.housingProblems || "");
                      return HOUSING_PROBLEM_OPTIONS.includes(s) ? s : "";
                    })();
                    const editVal: string = scnEdits.housingProblems !== undefined
                      ? scnEdits.housingProblems
                      : savedVal;

                    if (!scnEditMode) {
                      return (
                        <div className="flex items-center justify-between py-2 border-b border-slate-100">
                          <span className="text-sm text-slate-500">18. Housing problems</span>
                          <span className="text-sm text-slate-900">{savedVal || "—"}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center justify-between py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-600">18. Do you have problems with any of the following?</span>
                        <Select
                          value={editVal}
                          onValueChange={(v) => setScnEdits((prev) => ({ ...prev, housingProblems: v }))}
                        >
                          <SelectTrigger className="h-7 text-sm w-64 border-slate-300">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {HOUSING_PROBLEM_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}

                  {/* Q19: Difficulty climbing stairs or bathing */}
                  <YesNoRow num={19} label="Member has difficulty climbing stairs or bathing" field="difficultyClimbingStairs" currentValue={screening.difficultyClimbingStairs} />
                </div>
              );
            })()}

            <div className="mt-6 pt-4 border-t border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Food Allergies / Dietary Restrictions</h3>
              {scnEditMode ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Food allergies?</span>
                    <Select value={scnEdits.foodAllergies || ""} onValueChange={(v) => setScnEdits((prev) => ({ ...prev, foodAllergies: v, foodAllergiesDetails: v === "No" ? "" : prev.foodAllergiesDetails }))}>
                      <SelectTrigger className="h-7 text-sm w-28 border-slate-300"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {scnEdits.foodAllergies === "Yes" && (
                    <div className="py-2 border-b border-slate-100 bg-amber-50/50 px-3 rounded">
                      <Label className="text-xs text-amber-700 font-medium">Allergy details</Label>
                      <Input
                        className="h-7 text-sm mt-1 border-amber-200 focus:border-amber-400"
                        value={scnEdits.foodAllergiesDetails || ""}
                        onChange={(e) => setScnEdits((prev) => ({ ...prev, foodAllergiesDetails: e.target.value }))}
                        placeholder="e.g. Peanuts, Shellfish..."
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Dietary restrictions</span>
                    <Input
                      className="h-7 text-sm w-44 border-slate-300"
                      value={scnEdits.dietaryRestrictions || ""}
                      onChange={(e) => setScnEdits((prev) => ({ ...prev, dietaryRestrictions: e.target.value }))}
                      placeholder="e.g. Kosher, Halal, Vegetarian..."
                    />
                  </div>
                </div>
              ) : (
                <>
                  <InfoLine label="Food allergies" value={fd.foodAllergies === "Yes" ? (fd.foodAllergiesDetails || "Yes") : (fd.foodAllergies || "—")} />
                  <InfoLine label="Dietary restrictions" value={fd.dietaryRestrictions || "—"} />
                </>
              )}
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Household Appliance / Cooking Needs</h3>
              {scnEditMode ? (
                <div className="space-y-3">
                  {([
                    { key: "needsRefrigerator", label: "Needs refrigerator" },
                    { key: "needsMicrowave", label: "Needs microwave" },
                    { key: "needsCookingUtensils", label: "Needs cooking utensils/supplies" },
                  ] as const).map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">{label}</span>
                      <Select
                        value={scnEdits[key] || ""}
                        onValueChange={(v) => setScnEdits((prev) => ({ ...prev, [key]: v }))}
                      >
                        <SelectTrigger className="h-7 text-sm w-28 border-slate-300"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <InfoLine label="Needs refrigerator" value={fd.needsRefrigerator || "—"} />
                  <InfoLine label="Needs microwave" value={fd.needsMicrowave || "—"} />
                  <InfoLine label="Needs cooking utensils/supplies" value={fd.needsCookingUtensils || "—"} />
                </>
              )}
            </div>
            </div>
          </div>
        )}

        {/* Services Tab */}
        {activeTab === "services" && (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Services</h2>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-8 text-sm px-3" onClick={() => setShowAddService(true)}>
                <Plus className="h-4 w-4" /> Add Service
              </Button>
            </div>
            {clientServices && (clientServices as any[]).length > 0 ? (
              <div className="space-y-3">
                {(clientServices as any[]).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{s.name}</p>
                      {s.description && <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>}
                      {s.startDate && <p className="text-xs text-slate-400 mt-0.5">Started: {formatLocalDateShort(s.startDate)}</p>}
                    </div>
                    <Badge className={`text-xs ${s.status === "active" ? "bg-emerald-100 text-emerald-700" : s.status === "completed" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{s.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No services yet. Add one to get started.</p>
              </div>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                <Activity className="h-5 w-5 text-slate-400" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Activity Log</h2>
                  <p className="text-xs text-slate-400 mt-0.5">All recorded actions for this client</p>
                </div>
                {activityData && (
                  <span className="ml-auto text-xs text-slate-400">{activityData.total} event{activityData.total !== 1 ? "s" : ""}</span>
                )}
              </div>

              {activityLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
                </div>
              ) : !activityData || activityData.rows.length === 0 ? (
                <div className="text-center py-16">
                  <Activity className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No activity recorded for this client yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {activityData.rows.map((entry: any) => {
                    const Icon = getActivityIcon(entry.action);
                    const { label, color } = getActivityMeta(entry.action);
                    return (
                      <div key={entry.id} className="flex gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors">
                        {/* Icon column */}
                        <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        {/* Content column */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-sm font-medium text-slate-800">{label}</span>
                              {entry.details && (
                                <ActivityDetails action={entry.action} details={entry.details} />
                              )}
                            </div>
                            <time className="text-xs text-slate-400 whitespace-nowrap shrink-0 mt-0.5">
                              {new Date(entry.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                            </time>
                          </div>
                          {entry.actorName && (
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {entry.actorName}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {activityData && activityData.total > activityPageSize && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                  <span className="text-xs text-slate-400">
                    Page {activityPage} of {Math.ceil(activityData.total / activityPageSize)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={activityPage <= 1}
                      onClick={() => setActivityPage((p) => p - 1)}
                      className="px-3 py-1.5 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      disabled={activityPage >= Math.ceil(activityData.total / activityPageSize)}
                      onClick={() => setActivityPage((p) => p + 1)}
                      className="px-3 py-1.5 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === "chat" && client && (
          <ClientChatTab
            submissionId={id}
            clientName={`${client.firstName} ${client.lastName}`}
          />
        )}

        {/* ═══ DIALOGS ═══ */}

        {/* Edit Client Dialog */}
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Client</DialogTitle><DialogDescription>Update all client information</DialogDescription></DialogHeader>
            <div className="space-y-4">
              {/* Personal Info */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Personal Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">First Name</Label><Input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} /></div>
                  <div><Label className="text-xs">Last Name</Label><Input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} /></div>
                  <div><Label className="text-xs">Date of Birth</Label><Input type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} /></div>
                  <div><Label className="text-xs">Medicaid ID (CIN)</Label><Input value={editForm.medicaidId} onChange={(e) => setEditForm({ ...editForm, medicaidId: e.target.value })} /></div>
                  <div><Label className="text-xs">Phone</Label><Input value={editForm.cellPhone} onChange={(e) => setEditForm({ ...editForm, cellPhone: e.target.value })} /></div>
                  <div><Label className="text-xs">Email</Label><Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
                  <div><Label className="text-xs">Language</Label>
                    <Select value={editForm.language} onValueChange={(v) => setEditForm({ ...editForm, language: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["English","Spanish","Chinese","Russian","Arabic","French","Haitian Creole","Bengali","Korean","Other"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Program</Label>
                    <Select value={editForm.program} onValueChange={(v) => setEditForm({ ...editForm, program: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["PHS","SNAP-Ed","WIC","Other"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {/* Address */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Address</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label className="text-xs">Street Address</Label><Input value={editForm.streetAddress} onChange={(e) => setEditForm({ ...editForm, streetAddress: e.target.value })} /></div>
                  <div><Label className="text-xs">Apt / Unit</Label><Input value={editForm.aptUnit} onChange={(e) => setEditForm({ ...editForm, aptUnit: e.target.value })} /></div>
                  <div><Label className="text-xs">City</Label><Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} /></div>
                  <div><Label className="text-xs">State</Label><Input value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} /></div>
                  <div><Label className="text-xs">Zip Code</Label><Input value={editForm.zipcode} onChange={(e) => setEditForm({ ...editForm, zipcode: e.target.value })} /></div>
                  <div><Label className="text-xs">Borough</Label>
                    <Select value={editForm.borough} onValueChange={(v) => setEditForm({ ...editForm, borough: v })}>
                      <SelectTrigger><SelectValue placeholder="Select borough" /></SelectTrigger>
                      <SelectContent>
                        {["Bronx","Brooklyn","Manhattan","Queens","Staten Island"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Neighborhood</Label><Input value={editForm.neighborhood} onChange={(e) => setEditForm({ ...editForm, neighborhood: e.target.value })} /></div>
                </div>
              </div>
              {/* Program Details */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Program Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Vendor / Supermarket</Label><Input value={editForm.supermarket} onChange={(e) => setEditForm({ ...editForm, supermarket: e.target.value })} /></div>
                  <div><Label className="text-xs">Referral Source</Label><Input value={editForm.referralSource} onChange={(e) => setEditForm({ ...editForm, referralSource: e.target.value })} /></div>
                </div>
              </div>
              {/* Household Members */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Household Members</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setEditForm({ ...editForm, householdMembers: [...editForm.householdMembers, { name: "", dateOfBirth: "", medicaidId: "", relationship: "" }] })}
                  >
                    <Plus className="h-3 w-3" /> Add Member
                  </Button>
                </div>
                {editForm.householdMembers.length === 0 && (
                  <p className="text-xs text-slate-400 py-2">No household members. Click "Add Member" to add one.</p>
                )}
                <div className="space-y-3">
                  {editForm.householdMembers.map((m, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600">Member {idx + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            const updated = editForm.householdMembers.filter((_, i) => i !== idx);
                            setEditForm({ ...editForm, householdMembers: updated });
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <Label className="text-xs">Full Name</Label>
                          <Input
                            value={m.name}
                            onChange={(e) => {
                              const updated = [...editForm.householdMembers];
                              updated[idx] = { ...updated[idx], name: e.target.value };
                              setEditForm({ ...editForm, householdMembers: updated });
                            }}
                            placeholder="Full name"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Date of Birth</Label>
                          <Input
                            type="date"
                            value={m.dateOfBirth}
                            onChange={(e) => {
                              const updated = [...editForm.householdMembers];
                              updated[idx] = { ...updated[idx], dateOfBirth: e.target.value };
                              setEditForm({ ...editForm, householdMembers: updated });
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Medicaid ID (CIN)</Label>
                          <Input
                            value={m.medicaidId}
                            onChange={(e) => {
                              const updated = [...editForm.householdMembers];
                              updated[idx] = { ...updated[idx], medicaidId: e.target.value };
                              setEditForm({ ...editForm, householdMembers: updated });
                            }}
                            placeholder="e.g. AB12345C"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Relationship</Label>
                          <Input
                            value={m.relationship}
                            onChange={(e) => {
                              const updated = [...editForm.householdMembers];
                              updated[idx] = { ...updated[idx], relationship: e.target.value };
                              setEditForm({ ...editForm, householdMembers: updated });
                            }}
                            placeholder="e.g. Spouse, Child, Parent"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Employment */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Employment</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Client Employed</Label>
                    <Select value={editForm.employed} onValueChange={(v) => setEditForm({ ...editForm, employed: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["Yes","No","Unknown"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Spouse Employed</Label>
                    <Select value={editForm.spouseEmployed} onValueChange={(v) => setEditForm({ ...editForm, spouseEmployed: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["Yes","No","N/A","Unknown"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {/* Food Preferences */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Food Preferences</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Food Allergies</Label>
                    <Select value={editForm.foodAllergies} onValueChange={(v) => setEditForm({ ...editForm, foodAllergies: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["Yes","No"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {editForm.foodAllergies === "Yes" && <div><Label className="text-xs">Allergy Details</Label><Input value={editForm.foodAllergiesDetails} onChange={(e) => setEditForm({ ...editForm, foodAllergiesDetails: e.target.value })} /></div>}
                  <div className="col-span-2"><Label className="text-xs">Dietary Restrictions</Label><Input value={editForm.dietaryRestrictions} onChange={(e) => setEditForm({ ...editForm, dietaryRestrictions: e.target.value })} placeholder="e.g. Halal, Kosher, Vegetarian" /></div>
                  <div><Label className="text-xs">Breakfast Items</Label><Input value={editForm.breakfastItems} onChange={(e) => setEditForm({ ...editForm, breakfastItems: e.target.value })} /></div>
                  <div><Label className="text-xs">Lunch Items</Label><Input value={editForm.lunchItems} onChange={(e) => setEditForm({ ...editForm, lunchItems: e.target.value })} /></div>
                  <div><Label className="text-xs">Dinner Items</Label><Input value={editForm.dinnerItems} onChange={(e) => setEditForm({ ...editForm, dinnerItems: e.target.value })} /></div>
                  <div><Label className="text-xs">Snack Items</Label><Input value={editForm.snackItems} onChange={(e) => setEditForm({ ...editForm, snackItems: e.target.value })} /></div>
                  <div><Label className="text-xs">Needs Refrigerator</Label>
                    <Select value={editForm.needsRefrigerator} onValueChange={(v) => setEditForm({ ...editForm, needsRefrigerator: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["Yes","No"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Needs Microwave</Label>
                    <Select value={editForm.needsMicrowave} onValueChange={(v) => setEditForm({ ...editForm, needsMicrowave: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["Yes","No"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Needs Cooking Utensils</Label>
                    <Select value={editForm.needsCookingUtensils} onValueChange={(v) => setEditForm({ ...editForm, needsCookingUtensils: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["Yes","No"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleEditSave} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Client Dialog */}
        <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Client</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete {client.firstName} {client.lastName}? This will also delete all related tasks, notes, documents, and services. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteClientMutation.mutate({ id })} disabled={deleteClientMutation.isPending}>
                {deleteClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Reassign / Remove Assessor Warning */}
        <AlertDialog open={showReassignWarning} onOpenChange={setShowReassignWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pendingAssessorId === null ? "Remove Assessor?" : "Reassign Assessor?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingAssessorId === null
                  ? "This will remove the current assessor from this client. The client will appear as unassigned. Do you want to continue?"
                  : "This client is already assigned to an assessor. Reassigning will remove the current assessor and assign the new one. Do you want to continue?"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setShowReassignWarning(false); setPendingAssessorId(undefined as any); }}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={pendingAssessorId === null ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}
                onClick={() => {
                  assignAssessorMutation.mutate({ submissionId: id, assessorId: pendingAssessorId });
                  setShowReassignWarning(false);
                }}
                disabled={assignAssessorMutation.isPending}
              >
                {assignAssessorMutation.isPending
                  ? (pendingAssessorId === null ? "Removing..." : "Reassigning...")
                  : (pendingAssessorId === null ? "Yes, Remove Assessor" : "Yes, Reassign")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Add Household Member Dialog */}
        <Dialog open={showAddHousehold} onOpenChange={setShowAddHousehold}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Household Member</DialogTitle><DialogDescription>Add a new household member to this client</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Full Name *</Label><Input placeholder="Full name" value={householdForm.name} onChange={(e) => setHouseholdForm({ ...householdForm, name: e.target.value })} /></div>
              <div><Label className="text-xs">Date of Birth</Label><Input type="date" value={householdForm.dateOfBirth} onChange={(e) => setHouseholdForm({ ...householdForm, dateOfBirth: e.target.value })} /></div>
              <div><Label className="text-xs">Medicaid ID (CIN)</Label><Input placeholder="AA00000A" value={householdForm.medicaidId} onChange={(e) => setHouseholdForm({ ...householdForm, medicaidId: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddHousehold(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddHousehold} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Address Dialog */}
        <Dialog open={showAddAddress} onOpenChange={setShowAddAddress}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Address</DialogTitle><DialogDescription>Add an additional address for this client</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Street *</Label><Input placeholder="123 Main St" value={addressForm.street} onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })} /></div>
              <div><Label className="text-xs">Apt/Unit</Label><Input placeholder="Apt 4B" value={addressForm.apt} onChange={(e) => setAddressForm({ ...addressForm, apt: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">City</Label><Input placeholder="Brooklyn" value={addressForm.city} onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })} /></div>
                <div><Label className="text-xs">State</Label><Input value={addressForm.state} onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })} /></div>
                <div><Label className="text-xs">Zip</Label><Input placeholder="11219" value={addressForm.zip} onChange={(e) => setAddressForm({ ...addressForm, zip: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddAddress(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddAddress} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Phone Dialog */}
        <Dialog open={showAddPhone} onOpenChange={setShowAddPhone}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Phone Number</DialogTitle><DialogDescription>Add an additional phone number</DialogDescription></DialogHeader>
            <div><Label className="text-xs">Phone Number *</Label><Input placeholder="(718) 555-0100" value={phoneForm} onChange={(e) => setPhoneForm(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddPhone(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddPhone} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Email Dialog */}
        <Dialog open={showAddEmail} onOpenChange={setShowAddEmail}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Email Address</DialogTitle><DialogDescription>Add an additional email address</DialogDescription></DialogHeader>
            <div><Label className="text-xs">Email *</Label><Input type="email" placeholder="name@example.com" value={emailForm} onChange={(e) => setEmailForm(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddEmail(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddEmail} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Household Member Dialog */}
        <Dialog open={editHouseholdIdx !== null} onOpenChange={(open) => { if (!open) setEditHouseholdIdx(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Edit Household Member</DialogTitle><DialogDescription>Update this household member's information</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Full Name *</Label><Input value={editHouseholdForm.name} onChange={(e) => setEditHouseholdForm({ ...editHouseholdForm, name: e.target.value })} /></div>
              <div><Label className="text-xs">Date of Birth</Label><Input type="date" value={editHouseholdForm.dateOfBirth} onChange={(e) => setEditHouseholdForm({ ...editHouseholdForm, dateOfBirth: e.target.value })} /></div>
              <div><Label className="text-xs">Medicaid ID (CIN)</Label><Input placeholder="AA00000A" value={editHouseholdForm.medicaidId} onChange={(e) => setEditHouseholdForm({ ...editHouseholdForm, medicaidId: e.target.value })} /></div>
              <div><Label className="text-xs">Relationship</Label><Input placeholder="e.g. Spouse, Child" value={editHouseholdForm.relationship} onChange={(e) => setEditHouseholdForm({ ...editHouseholdForm, relationship: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditHouseholdIdx(null)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleEditHousehold} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Address Dialog */}
        <Dialog open={editAddressIdx !== null} onOpenChange={(open) => { if (!open) setEditAddressIdx(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Edit Address</DialogTitle><DialogDescription>Update this address</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Street *</Label><Input value={editAddressForm.street} onChange={(e) => setEditAddressForm({ ...editAddressForm, street: e.target.value })} /></div>
              <div><Label className="text-xs">Apt/Unit</Label><Input value={editAddressForm.apt} onChange={(e) => setEditAddressForm({ ...editAddressForm, apt: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">City</Label><Input value={editAddressForm.city} onChange={(e) => setEditAddressForm({ ...editAddressForm, city: e.target.value })} /></div>
                <div><Label className="text-xs">State</Label><Input value={editAddressForm.state} onChange={(e) => setEditAddressForm({ ...editAddressForm, state: e.target.value })} /></div>
                <div><Label className="text-xs">Zip</Label><Input value={editAddressForm.zip} onChange={(e) => setEditAddressForm({ ...editAddressForm, zip: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditAddressIdx(null)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleEditAddress} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Phone Dialog */}
        <Dialog open={editPhoneIdx !== null} onOpenChange={(open) => { if (!open) setEditPhoneIdx(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Edit Phone Number</DialogTitle><DialogDescription>Update this phone number</DialogDescription></DialogHeader>
            <div><Label className="text-xs">Phone Number *</Label><Input value={editPhoneValue} onChange={(e) => setEditPhoneValue(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditPhoneIdx(null)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleEditPhone} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Email Dialog */}
        <Dialog open={editEmailIdx !== null} onOpenChange={(open) => { if (!open) setEditEmailIdx(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Edit Email Address</DialogTitle><DialogDescription>Update this email address</DialogDescription></DialogHeader>
            <div><Label className="text-xs">Email *</Label><Input type="email" value={editEmailValue} onChange={(e) => setEditEmailValue(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditEmailIdx(null)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleEditEmail} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Health Category Removal Warning Dialog */}
        <Dialog open={hcRemoveWarning !== null} onOpenChange={(open) => { if (!open) setHcRemoveWarning(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <span>⚠️</span> Remove "{hcRemoveWarning?.cat}"?
              </DialogTitle>
              <DialogDescription>
                This category has associated data that will be hidden (but not deleted) if you remove it:
              </DialogDescription>
            </DialogHeader>
            <ul className="text-sm text-slate-700 space-y-1 pl-4 list-disc">
              {hcRemoveWarning?.details.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
            <p className="text-xs text-slate-500">The data remains saved and will reappear if you re-add this category.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHcRemoveWarning(null)}>Keep Category</Button>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                if (hcRemoveWarning) {
                  setHcEdits((prev) => prev.filter((c) => c !== hcRemoveWarning.cat));
                  setHcRemoveWarning(null);
                }
              }}>Remove Anyway</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Task Dialog */}
        <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Task</DialogTitle><DialogDescription>Create a new task for {taskArea === "intake_rep" ? "Intake Rep" : "Assigned Worker"}</DialogDescription></DialogHeader>
            <div><Label className="text-xs">Task Description *</Label><Input placeholder="Describe the task..." value={taskForm} onChange={(e) => setTaskForm(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddTask(false)}>Cancel</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleAddTask} disabled={!taskForm.trim() || addTaskMutation.isPending}>
                {addTaskMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Task"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Service Dialog */}
        <Dialog open={showAddService} onOpenChange={setShowAddService}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Service</DialogTitle><DialogDescription>Add a new service for this client</DialogDescription></DialogHeader>
            <div><Label className="text-xs">Service Name *</Label><Input placeholder="Service name..." value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddService(false)}>Cancel</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => newServiceName.trim() && addServiceMutation.mutate({ submissionId: id, name: newServiceName.trim() })} disabled={!newServiceName.trim() || addServiceMutation.isPending}>
                {addServiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Refer to Organization Dialog */}
        <Dialog open={showReferOrg} onOpenChange={setShowReferOrg}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Refer Client to Organization</DialogTitle>
              <DialogDescription>
                Select an organization to refer {client?.firstName} {client?.lastName} to. All staff members of that organization will gain access to this client.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {client?.referredOrgId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                  <span className="font-medium">Currently referred to:</span> {(orgList as any[]).find((o: any) => o.id === client.referredOrgId)?.name ?? `Org #${client.referredOrgId}`}
                  {client.referredOrgNote && <p className="mt-1 text-blue-700">Note: {client.referredOrgNote}</p>}
                </div>
              )}
              <div>
                <Label className="text-xs font-medium">Organization *</Label>
                <Select value={referOrgId} onValueChange={setReferOrgId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select organization…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(orgList as any[]).map((org: any) => (
                      <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Referral Note / Reason</Label>
                <Textarea
                  className="mt-1 text-sm"
                  placeholder="Optional: reason for referral, special instructions…"
                  value={referOrgNote}
                  onChange={(e) => setReferOrgNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReferOrg(false)}>Cancel</Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                disabled={!referOrgId || referClientMutation.isPending}
                onClick={() => referClientMutation.mutate({ submissionId: id, orgId: parseInt(referOrgId), note: referOrgNote || undefined })}
              >
                {referClientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refer Client"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Terminal stage confirmation dialog */}
        <Dialog open={!!pendingStageChange} onOpenChange={(v) => { if (!v) setPendingStageChange(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirm Stage Change</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              You are about to move <strong>{client?.firstName} {client?.lastName}</strong> to{" "}
              <strong>{pendingStageChange ? (STAGE_CONFIG[pendingStageChange]?.label ?? pendingStageChange) : ""}</strong>.
              This is a significant outcome stage. Are you sure?
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPendingStageChange(null)}>Cancel</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  if (pendingStageChange) updateStageMutation.mutate({ id, stage: pendingStageChange as any });
                  setPendingStageChange(null);
                }}
              >
                Yes, confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageWrapper>
  );
}
