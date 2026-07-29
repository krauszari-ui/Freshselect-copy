import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, Loader2, Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Download, FileSpreadsheet, FileText, Trash2, Users, FileDown, FilterX, EyeOff, RotateCcw,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as XLSX from "xlsx";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { formatLocalDate, formatLocalDateShort } from "@/lib/utils";
import { toast } from "sonner";

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

const AVATAR_COLORS = [
  "bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-amber-500",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(firstName: string, lastName: string) {
  return `${(firstName || "")[0] || ""}${(lastName || "")[0] || ""}`.toUpperCase();
}

/* ─── Add Client Dialog ──────────────────────────────────────────────── */

interface AddClientForm {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  medicaidId: string;
  cellPhone: string;
  email: string;
  streetAddress: string;
  city: string;
  state: string;
  zipcode: string;
  language: string;
  neighborhood: string;
  supermarket: string;
}

const NEIGHBORHOODS_LIST = [
  { name: "Williamsburg", vendors: ["Foodoo Kosher", "Rosemary Kosher", "Chestnut", "Central Market", "One Stop Kosher"] },
  { name: "Borough Park", vendors: ["KRM", "Certo Market", "Breadberry"] },
  { name: "Flatbush", vendors: ["Pomegranate", "Moisha's Discount"] },
  { name: "Monsey", vendors: ["Evergreen", "Hatzlacha"] },
  { name: "Monroe", vendors: ["Refresh", "Landau's"] },
];

const ALL_VENDORS = NEIGHBORHOODS_LIST.flatMap(n => n.vendors);

const INITIAL_ADD_FORM: AddClientForm = {
  firstName: "", lastName: "", dateOfBirth: "", medicaidId: "",
  cellPhone: "", email: "", streetAddress: "", city: "Brooklyn",
  state: "NY", zipcode: "", language: "English", neighborhood: "Williamsburg", supermarket: "Foodoo Kosher",
};

function AddClientDialog({
  open, onClose, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<AddClientForm>({ ...INITIAL_ADD_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupCheckPhone, setDupCheckPhone] = useState("");
  const [dupCheckCin, setDupCheckCin] = useState("");
  const { data: dupResult } = trpc.admin.checkDuplicate.useQuery(
    { cellPhone: dupCheckPhone || undefined, medicaidId: dupCheckCin || undefined },
    { enabled: !!(dupCheckPhone || dupCheckCin) }
  );

  const submitMutation = trpc.submission.submit.useMutation({
    onSuccess: () => {
      toast.success("Client added successfully");
      setForm({ ...INITIAL_ADD_FORM });
      setErrors({});
      onSuccess();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add client");
    },
  });

  const update = (key: keyof AddClientForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleSubmit = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (!form.dateOfBirth) e.dateOfBirth = "Required";
    if (!form.medicaidId.trim()) e.medicaidId = "Required";
    else if (!/^[A-Za-z]{2}\d{5}[A-Za-z]$/.test(form.medicaidId))
      e.medicaidId = "Format: 2 letters, 5 digits, 1 letter";
    if (!form.cellPhone.trim()) e.cellPhone = "Required";
    if (!form.email.trim()) e.email = "Required";
    if (!form.streetAddress.trim()) e.streetAddress = "Required";
    if (!form.zipcode.trim()) e.zipcode = "Required";

    if (Object.keys(e).length > 0) { setErrors(e); return; }

    submitMutation.mutate({
      ...form,
      neighborhood: form.neighborhood,
      homePhone: "",
      aptUnit: "",
      healthCategories: [],
      employed: "No",
      spouseEmployed: "No",
      hasWic: "No",
      hasSnap: "No",
      newApplicant: "Yes",
      householdMembers: [],
      mealFocus: ["Lunch"],
      needsRefrigerator: "No",
      needsMicrowave: "No",
      needsCookingUtensils: "No",
      hipaaConsent: true,
      guardianName: `${form.firstName} ${form.lastName}`,
      signatureDataUrl: "admin-added",
      screeningQuestions: {},
    });
  };

  const availableVendors = form.neighborhood !== "all"
    ? NEIGHBORHOODS_LIST.find(n => n.name === form.neighborhood)?.vendors || ALL_VENDORS
    : ALL_VENDORS;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">First Name *</Label>
              <Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)}
                className={errors.firstName ? "border-red-400" : ""} placeholder="First Name" />
              {errors.firstName && <p className="text-red-500 text-xs mt-0.5">{errors.firstName}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-600">Last Name *</Label>
              <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)}
                className={errors.lastName ? "border-red-400" : ""} placeholder="Last Name" />
              {errors.lastName && <p className="text-red-500 text-xs mt-0.5">{errors.lastName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Date of Birth *</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)}
                className={errors.dateOfBirth ? "border-red-400" : ""} />
              {errors.dateOfBirth && <p className="text-red-500 text-xs mt-0.5">{errors.dateOfBirth}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-600">Medicaid ID (CIN) *</Label>
              <Input value={form.medicaidId} onChange={(e) => update("medicaidId", e.target.value.toUpperCase())}
                onBlur={(e) => setDupCheckCin(e.target.value.trim())}
                className={errors.medicaidId ? "border-red-400" : ""} placeholder="AB12345C" maxLength={8} />
              {errors.medicaidId && <p className="text-red-500 text-xs mt-0.5">{errors.medicaidId}</p>}
              {dupResult?.cinMatch && (
                <p className="text-amber-600 text-xs mt-0.5 font-medium">⚠ CIN already exists: <a href={`/admin/clients/${dupResult.cinMatch.id}`} className="underline" target="_blank">{dupResult.cinMatch.name}</a></p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Cell Phone *</Label>
              <Input value={form.cellPhone} onChange={(e) => update("cellPhone", e.target.value)}
                onBlur={(e) => setDupCheckPhone(e.target.value.trim())}
                className={errors.cellPhone ? "border-red-400" : ""} placeholder="(718) 555-0123" />
              {errors.cellPhone && <p className="text-red-500 text-xs mt-0.5">{errors.cellPhone}</p>}
              {dupResult?.phoneMatch && (
                <p className="text-amber-600 text-xs mt-0.5 font-medium">⚠ Phone already exists: <a href={`/admin/clients/${dupResult.phoneMatch.id}`} className="underline" target="_blank">{dupResult.phoneMatch.name}</a></p>
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-600">Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
                className={errors.email ? "border-red-400" : ""} placeholder="email@example.com" />
              {errors.email && <p className="text-red-500 text-xs mt-0.5">{errors.email}</p>}
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-600">Street Address *</Label>
            <Input value={form.streetAddress} onChange={(e) => update("streetAddress", e.target.value)}
              className={errors.streetAddress ? "border-red-400" : ""} placeholder="123 Main Street" />
            {errors.streetAddress && <p className="text-red-500 text-xs mt-0.5">{errors.streetAddress}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-slate-600">City</Label>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-slate-600">State</Label>
              <Input value={form.state} onChange={(e) => update("state", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Zipcode *</Label>
              <Input value={form.zipcode} onChange={(e) => update("zipcode", e.target.value)}
                className={errors.zipcode ? "border-red-400" : ""} placeholder="11219" />
              {errors.zipcode && <p className="text-red-500 text-xs mt-0.5">{errors.zipcode}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Language</Label>
              <Select value={form.language} onValueChange={(v) => update("language", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["English", "Spanish", "Yiddish", "Hebrew", "Russian", "Chinese", "Arabic"].map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Neighborhood</Label>
              <Select value={form.neighborhood} onValueChange={(v) => {
                update("neighborhood", v);
                const vendors = NEIGHBORHOODS_LIST.find(n => n.name === v)?.vendors || [];
                if (vendors.length > 0) update("supermarket", vendors[0]);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NEIGHBORHOODS_LIST.map((n) => (
                    <SelectItem key={n.name} value={n.name}>{n.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-600">Vendor</Label>
            <Select value={form.supermarket} onValueChange={(v) => update("supermarket", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableVendors.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="bg-green-700 hover:bg-green-800 text-white"
          >
            {submitMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Adding...</> : "Add Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Export Dropdown ────────────────────────────────────────────────── */

function ExportDropdown({ filters }: { filters: Record<string, any> }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportMutation = trpc.admin.exportCsv.useMutation();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    setOpen(false);
    try {
      const result = await exportMutation.mutateAsync(filters as any || {});
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const date = new Date().toISOString().slice(0, 10);
      triggerDownload(blob, `freshselect-clients-${date}.csv`);
      toast.success(`Exported ${result.count} clients to CSV`);
    } catch {
      toast.error("Failed to export clients");
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    setOpen(false);
    try {
      const result = await exportMutation.mutateAsync(filters as any || {});
      const wsData = [result.headers, ...result.data];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const colWidths = result.headers.map((h: string, i: number) => {
        let maxLen = h.length;
        result.data.forEach((row: string[]) => {
          if (row[i] && row[i].length > maxLen) maxLen = row[i].length;
        });
        return { wch: Math.min(maxLen + 2, 50) };
      });
      ws["!cols"] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clients");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const date = new Date().toISOString().slice(0, 10);
      triggerDownload(blob, `freshselect-clients-${date}.xlsx`);
      toast.success(`Exported ${result.count} clients to Excel`);
    } catch {
      toast.error("Failed to export clients");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        disabled={exporting}
        className="gap-1.5 h-9 px-4 text-sm border-slate-300 text-slate-700 hover:bg-slate-50"
      >
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Export
        <ChevronDown className="h-3 w-3 ml-0.5" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            Export to Excel
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FileText className="h-4 w-4 text-blue-600" />
            Export to CSV
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Count Badge ────────────────────────────────────────────────────── */
function CountBadge({ count }: { count: number | undefined }) {
  if (count === undefined || count === 0) return null;
  return (
    <span className="ml-auto text-[10px] font-semibold bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
      {count}
    </span>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────── */

export default function AdminClients() {
  const { user } = useAuth();
  const isAssessor = user?.role === "assessor";
  const searchParams = useSearch();
  const [, navigate] = useLocation();

  // SECURITY: Redirect assessors away from the full client list to their scoped portal
  useEffect(() => {
    if (user && user.role === "assessor") {
      navigate("/assessor", { replace: true });
    }
  }, [user, navigate]);

  // ─── URL-backed filter helpers ────────────────────────────────────────────
  // All filter state lives in the URL query string so the browser back button
  // naturally restores the exact filter state when returning from a client page.
  const up = useMemo(() => new URLSearchParams(searchParams), [searchParams]);

  const getParam = (key: string, fallback = "all") => up.get(key) || fallback;

  const setParam = (key: string, value: string, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all" || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (resetPage) next.delete("page");
    const qs = next.toString();
    navigate("/admin/clients" + (qs ? "?" + qs : ""), { replace: true });
  };

  const search = getParam("q", "");
  const stageFilter = getParam("stage");
  const languageFilter = getParam("lang");
  const boroughFilter = getParam("borough");
  const neighborhoodFilter = getParam("neighborhood");
  const vendorFilter = getParam("vendor");
  const programFilter = getParam("program");
  const workerFilter = getParam("worker");
  const repFilter = getParam("rep");
  const assessorFilter = getParam("assessor");
  const orgFilter = getParam("org");
  const referralFilter = getParam("referral");
  const applicantTypeFilter = getParam("applicantType");
  const assessmentCompletedFilter = getParam("assessmentCompleted");
  const zipcodeFilter = getParam("zipcode");
  const priorityFilter = getParam("priority");
  const sortDir = (up.get("sort") as "desc" | "asc") || "desc";
  const page = parseInt(up.get("page") || "1", 10);

  const setSearch = (v: string) => setParam("q", v);
  const setStageFilter = (v: string) => setParam("stage", v);
  const setLanguageFilter = (v: string) => setParam("lang", v);
  const setBoroughFilter = (v: string) => setParam("borough", v);
  const setNeighborhoodFilter = (v: string, resetVendor = false) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all" || v === "") next.delete("neighborhood"); else next.set("neighborhood", v);
    if (resetVendor) next.delete("vendor");
    next.delete("page");
    const qs = next.toString();
    navigate("/admin/clients" + (qs ? "?" + qs : ""), { replace: true });
  };
  const setVendorFilter = (v: string) => setParam("vendor", v);
  const setProgramFilter = (v: string) => setParam("program", v);
  const setWorkerFilter = (v: string) => setParam("worker", v);
  const setRepFilter = (v: string) => setParam("rep", v);
  const setAssessorFilter = (v: string) => setParam("assessor", v);
  const setOrgFilter = (v: string) => setParam("org", v);
  const setReferralFilter = (v: string) => setParam("referral", v);
  const setApplicantTypeFilter = (v: string) => setParam("applicantType", v);
  const setAssessmentCompletedFilter = (v: string) => setParam("assessmentCompleted", v);
  const setZipcodeFilter = (v: string) => setParam("zipcode", v);
  const setPriorityFilter = (v: string) => setParam("priority", v);
  const setSortDir = (v: "desc" | "asc") => setParam("sort", v, true);
  const setPage = (p: number) => {
    const next = new URLSearchParams(searchParams);
    if (p <= 1) next.delete("page"); else next.set("page", String(p));
    navigate("/admin/clients" + (next.toString() ? "?" + next.toString() : ""), { replace: true });
  };

  // Local input state for the search box — debounced write to URL
  const [searchInput, setSearchInput] = useState(search);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  // Not Interested tab
  const activeTab = (up.get("tab") as "active" | "not_interested") || "active";
  const setActiveTab = (t: "active" | "not_interested") => {
    const next = new URLSearchParams();
    if (t !== "active") next.set("tab", t);
    navigate("/admin/clients" + (next.toString() ? "?" + next.toString() : ""), { replace: true });
  };
  const isNotInterestedTab = activeTab === "not_interested";

  // Permission check: can current user mark/restore Not Interested?
  const canMarkNotInterested = user?.role === "admin" || user?.role === "super_admin" ||
    (user?.role === "worker" && (user as any)?.permissions?.canMarkNotInterested === true);

  // ─── Scroll restoration ───────────────────────────────────────────────────
  // The scrollable element is AdminLayout's <main> (overflow-auto), not window.
  const getScrollContainer = () =>
    document.getElementById("admin-main-scroll") ||
    document.querySelector<HTMLElement>("main");

  // Restore scroll position after back navigation.
  // The back button in AdminClientDetail calls navigate(returnUrl) which updates
  // searchParams. We watch searchParams changes and restore scroll if a saved
  // position exists. Using a ref to avoid running on every filter change.
  const prevSearchParamsRef = useRef(searchParams);
  useEffect(() => {
    const saved = sessionStorage.getItem("adminClients.scrollTop");
    if (saved) {
      const container = getScrollContainer();
      if (container) {
        // Use a small delay to let the list re-render with the restored URL
        const timer = setTimeout(() => {
          container.scrollTop = parseInt(saved, 10);
          sessionStorage.removeItem("adminClients.scrollTop");
        }, 100);
        return () => clearTimeout(timer);
      }
    }
    prevSearchParamsRef.current = searchParams;
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save the full current URL + scroll position to sessionStorage before navigating
  // to a client detail page. The back button in AdminClientDetail reads this URL
  // and navigates back to it directly — bypassing any browser history stack issues
  // with wouter's SPA routing.
  const saveScrollAndNavigate = useCallback((href: string) => {
    // Save full URL (pathname + search) so back button can restore it exactly
    const currentUrl = window.location.pathname + window.location.search;
    sessionStorage.setItem("adminClients.returnUrl", currentUrl);
    // Also save scroll position
    const container = getScrollContainer();
    if (container) {
      sessionStorage.setItem("adminClients.scrollTop", String(container.scrollTop));
    }
    navigate(href);
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep local input in sync when URL changes externally (e.g. browser back)
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Debounce: write search to URL 400ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // debouncedSearch = URL-persisted value (already debounced via URL write)
  const debouncedSearch = search;

  const utils = trpc.useUtils();

  // "assessment_completed" is a virtual stage — maps to DB-level assessmentCompleted flag
  const effectiveStageFilter = stageFilter === "assessment_completed" ? undefined : stageFilter;
  const dbAssessmentCompleted: boolean | undefined =
    isAssessor ? true
    : stageFilter === "assessment_completed" ? true
    : assessmentCompletedFilter === "completed" ? true
    : assessmentCompletedFilter === "not_completed" ? false
    : undefined;

  // All filters are now passed to the DB — no client-side filtering
  const listQuery = trpc.admin.list.useQuery({
    search: debouncedSearch || undefined,
    stage: effectiveStageFilter !== "all" ? effectiveStageFilter : undefined,
    language: languageFilter !== "all" ? languageFilter : undefined,
    borough: boroughFilter !== "all" ? boroughFilter : undefined,
    neighborhood: neighborhoodFilter !== "all" ? neighborhoodFilter : undefined,
    supermarket: vendorFilter !== "all" ? vendorFilter : undefined,
    program: programFilter !== "all" ? programFilter : undefined,
    newApplicant: applicantTypeFilter !== "all" ? (applicantTypeFilter as "new" | "transfer") : undefined,
    assignedTo: workerFilter !== "all" ? parseInt(workerFilter) : undefined,
    intakeRep: repFilter !== "all" ? parseInt(repFilter) : undefined,
      assessorId: assessorFilter !== "all" ? parseInt(assessorFilter) : undefined,
      orgId: orgFilter !== "all" ? parseInt(orgFilter) : undefined,
      referralSource: referralFilter !== "all" ? referralFilter : undefined,
      assessmentCompleted: dbAssessmentCompleted,
      zipcode: zipcodeFilter !== "all" ? zipcodeFilter : undefined,
      priority: priorityFilter !== "all" ? (priorityFilter as "low" | "normal" | "high" | "urgent") : undefined,
      sortDir,
      page,
      pageSize: 25,
      // Pass notInterested filter based on active tab
      notInterested: isNotInterestedTab ? true : false,
    });

  // Filter counts — loaded once, used to show per-option counts in dropdowns
  const filterCountsQuery = trpc.admin.filterCounts.useQuery(undefined, {
    staleTime: 60_000, // refresh every 60s
  });
  const fc = filterCountsQuery.data as any;

  const staffQuery = trpc.admin.staffList.useQuery();
  const { data: assessorList } = trpc.admin.listAssessors.useQuery();
  const { data: orgList, isLoading: orgListLoading } = trpc.org.list.useQuery({ includeInactive: false });
  const referralLinksQuery = trpc.admin.referrals.list.useQuery();
  const referralLinks = (referralLinksQuery.data ?? []) as any[];

  const handleExportPdf = async (ids: number[]) => {
    if (ids.length === 0) return;
    setPdfExporting(true);
    try {
      // Fetch full data for selected clients
      const res = await fetch(`/api/trpc/admin.bulkGetByIds?input=${encodeURIComponent(JSON.stringify({ json: { ids } }))}`, {
        credentials: "include",
      });
      const json = await res.json();
      const clients: any[] = json?.result?.data?.json ?? [];
      if (!clients.length) { toast.error("No client data returned"); return; }
      // Build PDF using pdf-lib (dynamic import)
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const PAGE_W = 612, PAGE_H = 792;
      const MARGIN = 50;
      const LINE_H = 14;
      const COL_W = (PAGE_W - MARGIN * 2) / 2;

      const addPage = () => {
        const p = pdfDoc.addPage([PAGE_W, PAGE_H]);
        return { page: p, y: PAGE_H - MARGIN };
      };

      const drawText = (page: any, text: string, x: number, y: number, size = 10, isBold = false, color = rgb(0.1, 0.1, 0.1)) => {
        page.drawText(String(text ?? "").slice(0, 120), { x, y, size, font: isBold ? boldFont : font, color });
      };

      const drawLine = (page: any, y: number) => {
        page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      };

      const drawSection = (page: any, y: number, title: string) => {
        page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - MARGIN * 2, height: 16, color: rgb(0.9, 0.95, 0.9) });
        drawText(page, title, MARGIN + 4, y, 9, true, rgb(0.1, 0.4, 0.1));
        return y - LINE_H - 4;
      };

      for (const client of clients) {
        let { page, y } = addPage();

        // Header
        page.drawRectangle({ x: 0, y: PAGE_H - 60, width: PAGE_W, height: 60, color: rgb(0.1, 0.4, 0.1) });
        drawText(page, "FreshSelect Meals — Client Assessment", MARGIN, PAGE_H - 28, 14, true, rgb(1, 1, 1));
        drawText(page, `Ref: ${client.referenceNumber || "—"}  |  Exported: ${new Date().toLocaleDateString()}`, MARGIN, PAGE_H - 46, 9, false, rgb(0.8, 1, 0.8));
        y = PAGE_H - 75;

        // Client name
        drawText(page, `${client.firstName} ${client.lastName}`, MARGIN, y, 16, true);
        y -= 18;
        drawText(page, `Stage: ${client.stage || "—"}  |  Vendor: ${client.supermarket || "—"}  |  Medicaid ID: ${client.medicaidId || "—"}`, MARGIN, y, 9, false, rgb(0.4, 0.4, 0.4));
        y -= 20;
        drawLine(page, y); y -= 10;

        const fd = (client.formData as any) || {};
        const sq = fd.screeningQuestions || fd.screening || {};

        // Personal Info
        y = drawSection(page, y, "Personal Information");
        const personalFields = [
          ["Date of Birth", formatLocalDateShort(client.dateOfBirth) ?? "—"],
          ["Cell Phone", client.cellPhone || "—"],
          ["Email", client.email || "—"],
          ["Address", `${fd.streetAddress || ""} ${fd.aptUnit || ""}, ${fd.city || ""}, ${fd.state || ""} ${fd.zipcode || ""}`],
          ["Language", client.language || "—"],
          ["Neighborhood", client.neighborhood || "—"],
          ["Applicant Type", client.newApplicant || "—"],
          ["Transfer Agency", client.transferAgencyName || "—"],
        ];
        for (let i = 0; i < personalFields.length; i++) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = MARGIN + col * COL_W;
          const fy = y - row * LINE_H;
          drawText(page, `${personalFields[i][0]}:`, x, fy, 8, true, rgb(0.4, 0.4, 0.4));
          drawText(page, personalFields[i][1], x + 90, fy, 8);
        }
        y -= Math.ceil(personalFields.length / 2) * LINE_H + 8;

        // Health Categories
        y = drawSection(page, y, "Health Categories");
        const hc = (fd.healthCategories || []).join(", ") || "—";
        drawText(page, hc, MARGIN, y, 8);
        y -= LINE_H + 8;

        // SCN Screening Questionnaire
        y = drawSection(page, y, "SCN Screening Questionnaire");
        const scnFields: [string, string][] = [
          ["Living Situation", sq.livingSituation || "—"],
          ["Utility Shutoff Risk", sq.utilityShutoff || "—"],
          ["Receives SNAP", sq.receivesSnap || fd.hasSnap || "—"],
          ["Receives WIC", sq.receivesWic || fd.hasWic || "—"],
          ["Receives TANF", sq.receivesTanf || "—"],
          ["Enrolled Health Home", sq.enrolledHealthHome || "—"],
          ["Household Members", sq.householdMembersCount || fd.householdMembersCount || "—"],
          ["Members w/ Medicaid", sq.householdMembersWithMedicaid || "—"],
          ["Needs Work Assistance", sq.needsWorkAssistance || "—"],
          ["Wants School/Training", sq.wantsSchoolHelp || sq.wantsSchoolTraining || "—"],
          ["Transportation Barrier", sq.transportationBarrier || "—"],
          ["Chronic Illness", sq.hasChronicIllness || "—"],
          ["Illness Details", sq.chronicIllnessDetails || "—"],
          ["Other Health Issues", sq.otherHealthIssues || "—"],
          ["Meds Need Refrigeration", sq.medicationsRequireRefrigeration || "—"],
          ["Pregnant/Postpartum", sq.pregnantOrPostpartum || "—"],
          ["Due Date", fd.dueDate || sq.dueDate || "—"],
          ["Breastmilk Refrigeration", sq.breastmilkRefrigeration || "—"],
          ["Food Allergies", fd.foodAllergies || "—"],
          ["Allergy Details", fd.foodAllergiesDetails || "—"],
          ["Dietary Restrictions", fd.dietaryRestrictions || "—"],
        ];
        for (let i = 0; i < scnFields.length; i++) {
          if (y < MARGIN + 20) { ({ page, y } = addPage()); y -= 10; }
          const col = i % 2;
          const row = Math.floor(i / 2);
          if (col === 0) {
            const fy = y - row * LINE_H;
            drawText(page, `${scnFields[i][0]}:`, MARGIN, fy, 8, true, rgb(0.4, 0.4, 0.4));
            drawText(page, scnFields[i][1], MARGIN + 100, fy, 8);
          } else {
            const fy = y - (row) * LINE_H;
            drawText(page, `${scnFields[i][0]}:`, MARGIN + COL_W, fy, 8, true, rgb(0.4, 0.4, 0.4));
            drawText(page, scnFields[i][1], MARGIN + COL_W + 100, fy, 8);
          }
        }
        y -= Math.ceil(scnFields.length / 2) * LINE_H + 8;

        // Household Members
        if (y < MARGIN + 40) { ({ page, y } = addPage()); y -= 10; }
        y = drawSection(page, y, "Household Members");
        const members = fd.householdMembers || [];
        if (members.length === 0) {
          drawText(page, "No additional household members", MARGIN, y, 8, false, rgb(0.5, 0.5, 0.5));
          y -= LINE_H;
        } else {
          for (const m of members) {
            if (y < MARGIN + 20) { ({ page, y } = addPage()); y -= 10; }
            drawText(page, `• ${m.name || "—"} | DOB: ${m.dateOfBirth || "—"} | Medicaid: ${m.medicaidId || "—"} | Rel: ${m.relationship || "—"}`, MARGIN, y, 8);
            y -= LINE_H;
          }
        }
        y -= 8;

        // Footer
        drawLine(page, MARGIN + 10);
        drawText(page, `FreshSelect Meals SCN — Confidential — ${new Date().toLocaleDateString()}`, MARGIN, MARGIN, 7, false, rgb(0.6, 0.6, 0.6));
        drawText(page, `Page ${pdfDoc.getPageCount()}`, PAGE_W - MARGIN - 30, MARGIN, 7, false, rgb(0.6, 0.6, 0.6));
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `freshselect-assessments-${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${clients.length} client${clients.length === 1 ? "" : "s"} to PDF`);
    } catch (err: any) {
      console.error(err);
      toast.error("PDF export failed: " + (err?.message || "Unknown error"));
    } finally {
      setPdfExporting(false);
    }
  };

  const bulkDeleteMutation = trpc.admin.bulkDeleteClients.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deleted} client${data.deleted === 1 ? '' : 's'} deleted`);
      setSelectedIds(new Set());
      utils.admin.list.invalidate();
      utils.admin.filterCounts.invalidate();
    },
    onError: () => toast.error("Failed to delete selected clients"),
  });

  const markNotInterestedMutation = trpc.admin.markNotInterested.useMutation({
    onSuccess: () => {
      toast.success("Client moved to Not Interested");
      utils.admin.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to mark as Not Interested"),
  });

  const restoreClientMutation = trpc.admin.restoreClient.useMutation({
    onSuccess: () => {
      toast.success("Client restored to main list");
      utils.admin.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to restore client"),
  });

  const listData = listQuery.data as any;
  const rows = listData?.rows ?? [];
  const totalPages = listData?.totalPages ?? 1;
  const totalCount = listData?.total ?? 0;
  const totalMembers = listData?.totalMembers ?? 0;
  const hasActiveFilter = stageFilter !== "all" || neighborhoodFilter !== "all" || vendorFilter !== "all" || programFilter !== "all" || applicantTypeFilter !== "all" || languageFilter !== "all" || boroughFilter !== "all" || workerFilter !== "all" || repFilter !== "all" || assessorFilter !== "all" || orgFilter !== "all" || referralFilter !== "all" || assessmentCompletedFilter !== "all" || zipcodeFilter !== "all" || priorityFilter !== "all" || debouncedSearch.trim() !== "";

  const clearAllFilters = () => {
    setSearchInput("");
    navigate("/admin/clients", { replace: true });
  };

  // Sorting is handled server-side; rows are already in the correct order
  const sortedRows = rows;

  const staffList = (staffQuery.data ?? []) as any[];

  const getWorkerName = (id: number | null) => {
    if (!id) return "Unassigned";
    const w = staffList.find((s: any) => s.id === id);
    return w?.name || "Unknown";
  };

  // Vendors available for the selected neighborhood
  const availableVendors = neighborhoodFilter !== "all"
    ? NEIGHBORHOODS_LIST.find(n => n.name === neighborhoodFilter)?.vendors || ALL_VENDORS
    : ALL_VENDORS;

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
        {/* Assessor locked-view banner */}
        {isAssessor && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Assessment Completed</span>
            <span className="text-xs text-amber-600">— You are viewing clients whose assessment has been completed and are ready for review.</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
            <p className="text-slate-500 text-sm mt-0.5">{totalCount} total clients</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ExportDropdown filters={{
              stage: (stageFilter !== "all" && stageFilter !== "assessment_completed") ? stageFilter : undefined,
              supermarket: vendorFilter !== "all" ? vendorFilter : undefined,
              neighborhood: neighborhoodFilter !== "all" ? neighborhoodFilter : undefined,
              program: programFilter !== "all" ? programFilter : undefined,
              language: languageFilter !== "all" ? languageFilter : undefined,
              borough: boroughFilter !== "all" ? boroughFilter : undefined,
              search: debouncedSearch || undefined,
              assignedTo: workerFilter !== "all" ? parseInt(workerFilter) : undefined,
              intakeRep: repFilter !== "all" ? parseInt(repFilter) : undefined,
              referralSource: referralFilter !== "all" ? referralFilter : undefined,
              assessmentCompleted: isAssessor ? true : stageFilter === "assessment_completed" ? true : assessmentCompletedFilter === "completed" ? true : assessmentCompletedFilter === "not_completed" ? false : undefined,
            }} />
            {!isAssessor && (
              <Button
                onClick={() => setShowAddDialog(true)}
                className="bg-green-700 hover:bg-green-800 text-white gap-1.5 h-9 px-4 text-sm"
              >
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            )}
          </div>
        </div>

        {/* Tab Switcher: Active Clients / Not Interested */}
        {!isAssessor && (
          <div className="flex gap-1 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("active")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                !isNotInterestedTab
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Active Clients
            </button>
            <button
              onClick={() => setActiveTab("not_interested")}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isNotInterestedTab
                  ? "border-slate-500 text-slate-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <EyeOff className="h-3.5 w-3.5" />
              Not Interested
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name or CIN..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-10 text-sm bg-white border-slate-200"
          />
        </div>

        {/* Filter Row — hidden for assessors */}
        {!isAssessor && (
          <div className="flex flex-wrap gap-2">
            {/* Stage */}
            <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); }}>
              <SelectTrigger className="w-[180px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {Object.entries(STAGE_CONFIG).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center justify-between w-full gap-2">
                      {label}
                      <CountBadge count={fc?.stage?.[key]} />
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value="assessment_completed">Assessment Completed</SelectItem>
              </SelectContent>
            </Select>

            {/* Language */}
            <Select value={languageFilter} onValueChange={(v) => { setLanguageFilter(v); }}>
              <SelectTrigger className="w-[130px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Language</SelectItem>
                {["English", "Spanish", "Yiddish", "Hebrew", "Russian"].map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    <span className="flex items-center justify-between w-full gap-2">
                      {lang}
                      <CountBadge count={fc?.language?.[lang]} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Borough */}
            <Select value={boroughFilter} onValueChange={(v) => { setBoroughFilter(v); }}>
              <SelectTrigger className="w-[130px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Borough" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Borough</SelectItem>
                {["Brooklyn", "Manhattan", "Queens", "Bronx", "Staten Island"].map((b) => (
                  <SelectItem key={b} value={b}>
                    <span className="flex items-center justify-between w-full gap-2">
                      {b}
                      <CountBadge count={fc?.borough?.[b]} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Neighborhood */}
            <Select value={neighborhoodFilter} onValueChange={(v) => setNeighborhoodFilter(v, true)}>
              <SelectTrigger className="w-[150px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Neighborhood" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Neighborhood</SelectItem>
                {NEIGHBORHOODS_LIST.map((n) => (
                  <SelectItem key={n.name} value={n.name}>
                    <span className="flex items-center justify-between w-full gap-2">
                      {n.name}
                      <CountBadge count={fc?.neighborhood?.[n.name]} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Zipcode */}
            <Select value={zipcodeFilter} onValueChange={(v) => { setZipcodeFilter(v); }}>
              <SelectTrigger className="w-[120px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Zipcode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Zipcode</SelectItem>
                {Object.entries((fc?.zipcode ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([zip, count]) => (
                  <SelectItem key={zip} value={zip}>
                    <span className="flex items-center justify-between w-full gap-2">
                      {zip}
                      <CountBadge count={count as number} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Vendor */}
            <Select value={vendorFilter} onValueChange={(v) => { setVendorFilter(v); }}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {availableVendors.map((v) => (
                  <SelectItem key={v} value={v}>
                    <span className="flex items-center justify-between w-full gap-2">
                      {v}
                      <CountBadge count={fc?.vendor?.[v]} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Applicant Type */}
            <Select value={applicantTypeFilter} onValueChange={(v) => { setApplicantTypeFilter(v); }}>
              <SelectTrigger className="w-[140px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">New / Transfer</SelectItem>
                <SelectItem value="New">
                  <span className="flex items-center justify-between w-full gap-2">
                    New Client
                    <CountBadge count={fc?.applicantType?.["New"]} />
                  </span>
                </SelectItem>
                <SelectItem value="Transfer">
                  <span className="flex items-center justify-between w-full gap-2">
                    Transfer
                    <CountBadge count={fc?.applicantType?.["Transfer"]} />
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Program */}
            <Select value={programFilter} onValueChange={(v) => { setProgramFilter(v); }}>
              <SelectTrigger className="w-[130px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Program" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Program</SelectItem>
                {["PHS", "SCN"].map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="flex items-center justify-between w-full gap-2">
                      {p}
                      <CountBadge count={fc?.program?.[p]} />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Assigned Worker */}
            <Select value={workerFilter} onValueChange={(v) => { setWorkerFilter(v); }}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Assigned Worker" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Assigned Worker</SelectItem>
                {staffList.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name || `User #${s.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Intake Rep */}
            <Select value={repFilter} onValueChange={(v) => { setRepFilter(v); }}>
              <SelectTrigger className="w-[170px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Intake Representative" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Intake Representative</SelectItem>
                {staffList.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name || `User #${s.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Assessor */}
            {(assessorList ?? []).length > 0 && (
              <Select value={assessorFilter} onValueChange={(v) => { setAssessorFilter(v); }}>
                <SelectTrigger className="w-[160px] h-9 text-sm bg-white border-indigo-200 text-indigo-700">
                  <SelectValue placeholder="Assessor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assessors</SelectItem>
                  {(assessorList ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name || a.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Organization */}
            <Select value={orgFilter} onValueChange={(v) => { setOrgFilter(v); }} disabled={orgListLoading}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-white border-purple-200 text-purple-700">
                <SelectValue placeholder={orgListLoading ? "Loading..." : "Organization"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {(orgList ?? []).map((org: any) => (
                  <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Referral Source */}
            <Select value={referralFilter} onValueChange={(v) => { setReferralFilter(v); }}>
              <SelectTrigger className="w-[160px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Referral Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Referral Source</SelectItem>
                {referralLinks.map((r: any) => (
                  <SelectItem key={r.code} value={r.code}>{r.referrerName || r.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); }}>
              <SelectTrigger className="w-[130px] h-9 text-sm bg-white border-slate-200">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">🔴 Urgent</SelectItem>
                <SelectItem value="high">🟠 High</SelectItem>
                <SelectItem value="normal">🟢 Normal</SelectItem>
                <SelectItem value="low">⚪ Low</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear All Filters — only visible when at least one filter is active */}
            {hasActiveFilter && (
              <button
                onClick={clearAllFilters}
                className="ml-auto flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
              >
                <FilterX className="h-4 w-4" />
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Bulk Action Toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-sm font-medium text-slate-700">{selectedIds.size} client{selectedIds.size === 1 ? '' : 's'} selected</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-white"
              onClick={() => handleExportPdf(Array.from(selectedIds))}
              disabled={pdfExporting}
            >
              {pdfExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Export PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-red-300 text-red-700 hover:bg-red-100 bg-white"
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete Selected
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-slate-500" onClick={() => setSelectedIds(new Set())}>
              Clear Selection
            </Button>
          </div>
        )}

        {/* Filtered Totals Bar */}
        <div className={`flex items-center gap-4 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
          hasActiveFilter
            ? "bg-blue-50 border-blue-200 text-blue-800"
            : "bg-slate-50 border-slate-200 text-slate-600"
        }`}>
          {listQuery.isLoading ? (
            <span className="flex items-center gap-2 text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Calculating...
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 opacity-70" />
                <span className="font-semibold">{totalCount.toLocaleString()}</span>
                <span className="font-normal opacity-80">{hasActiveFilter ? "matching clients" : "total clients"}</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1.5">
                <span className="font-semibold">{totalMembers.toLocaleString()}</span>
                <span className="font-normal opacity-80">{hasActiveFilter ? "matching members" : "total members"}</span>
              </span>
              {hasActiveFilter && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-xs opacity-70 italic">filtered view</span>
                </>
              )}
            </>
          )}
        </div>

        {/* Not Interested tab info banner */}
        {isNotInterestedTab && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <EyeOff className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-sm text-slate-600">
              These clients have been marked as <strong>Not Interested</strong> and are hidden from the main client list.
              Use the <strong>Restore</strong> button to move them back.
            </span>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden admin-table-wrap">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              {isNotInterestedTab ? (
                <>
                  <EyeOff className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm font-medium">No clients marked as Not Interested</p>
                  <p className="text-xs text-slate-400 mt-1">Clients you mark as Not Interested will appear here.</p>
                </>
              ) : (
                <p className="text-sm">No clients found</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={sortedRows.length > 0 && sortedRows.every((c: any) => selectedIds.has(c.id))}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedIds(new Set(sortedRows.map((c: any) => c.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Client</th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">CIN</th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">DOB</th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Language</th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Members</th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3 cursor-pointer select-none"
                      onClick={() => {
                        if (sortDir === "desc") setSortDir("asc");
                        else setParam("sort", "", true);
                      }}>
                      <span className="flex items-center gap-1">
                        Date Added
                        {sortDir === "desc" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5 text-orange-500" />}
                      </span>
                    </th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Priority</th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Type</th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Assessor</th>
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Stage</th>
                    {canMarkNotInterested && (
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((client: any) => {
                    const fd = client.formData as any || {};
                    const initials = getInitials(client.firstName, client.lastName);
                    const avatarColor = getAvatarColor(`${client.firstName}${client.lastName}`);
                    const workerName = getWorkerName(client.assignedTo);
                    const stageInfo = STAGE_CONFIG[client.stage] || { label: client.stage, bg: "bg-slate-100", text: "text-slate-700" };
                    // SLA: compute days in current stage
                    const stageRef = client.stageUpdatedAt ? new Date(client.stageUpdatedAt) : new Date(client.createdAt);
                    const daysInStage = Math.floor((Date.now() - stageRef.getTime()) / 86_400_000);
                    const terminalStages = ["not_eligible", "ineligible", "level_one_only", "level_one_household", "level_2_active"];
                    const isTerminal = terminalStages.includes(client.stage);
                    const slaWarning = !isTerminal && daysInStage >= 14 ? "red" : !isTerminal && daysInStage >= 7 ? "yellow" : null;
                    const dob = formatLocalDate(fd.dateOfBirth) ?? "—";
                    const additionalCount = typeof client.additionalMembersCount === "number" ? client.additionalMembersCount : (fd.householdMembers?.length ?? 0);
                    const membersDisplay = additionalCount > 0 ? `1 + ${additionalCount}` : "1";

                    const isSelected = selectedIds.has(client.id);
                    return (
                      <tr key={client.id} className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${isSelected ? 'bg-red-50/40' : ''}`}>
                        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedIds);
                              if (checked) next.add(client.id); else next.delete(client.id);
                              setSelectedIds(next);
                            }}
                            aria-label={`Select ${client.firstName} ${client.lastName}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => saveScrollAndNavigate(`/admin/clients/${client.id}`)}
                          >
                            <div className={`h-9 w-9 rounded-full ${avatarColor} flex items-center justify-center text-white font-medium text-xs shrink-0`}>
                              {initials}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-green-700 hover:text-green-800">{client.firstName} {client.lastName}</p>
                              <p className="text-xs text-slate-400">{workerName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{client.medicaidId}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{dob}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{client.language || "English"}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                            <span>{membersDisplay}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {new Date(client.createdAt).toLocaleDateString("en-US")}
                        </td>
                        <td className="px-4 py-3">
                          {client.newApplicant === "Transfer" ? (
                            <span className="inline-flex items-center gap-1">
                              <Badge className="bg-amber-100 text-amber-700 text-[11px] font-medium border-0">Transfer</Badge>
                              {client.transferAgencyName && (
                                <span className="text-[11px] text-slate-400 truncate max-w-[100px]" title={client.transferAgencyName}>{client.transferAgencyName}</span>
                              )}
                            </span>
                          ) : client.newApplicant === "New" ? (
                            <Badge className="bg-emerald-50 text-emerald-700 text-[11px] font-medium border-0">New</Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const p = client.priority || "normal";
                            const cfg: Record<string, { label: string; cls: string }> = {
                              urgent: { label: "Urgent", cls: "bg-red-100 text-red-700" },
                              high:   { label: "High",   cls: "bg-orange-100 text-orange-700" },
                              normal: { label: "Normal", cls: "bg-slate-100 text-slate-600" },
                              low:    { label: "Low",    cls: "bg-slate-50 text-slate-400" },
                            };
                            const { label, cls } = cfg[p] ?? cfg.normal;
                            return <Badge className={`${cls} text-[11px] font-medium border-0`}>{label}</Badge>;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs text-indigo-700">
                          {client.assessorId
                            ? ((assessorList ?? []).find((a: any) => a.id === client.assessorId)?.name || `#${client.assessorId}`)
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge className={`${stageInfo.bg} ${stageInfo.text} text-[11px] font-medium border-0`}>
                              {stageInfo.label}
                            </Badge>
                            {slaWarning === "red" && (
                              <span title={`${daysInStage} days in this stage — overdue`} className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 cursor-default">
                                ⚠ {daysInStage}d
                              </span>
                            )}
                            {slaWarning === "yellow" && (
                              <span title={`${daysInStage} days in this stage — approaching deadline`} className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 cursor-default">
                                ⏱ {daysInStage}d
                              </span>
                            )}
                          </div>
                        </td>
                        {canMarkNotInterested && (
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {isNotInterestedTab ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-white"
                                disabled={restoreClientMutation.isPending}
                                onClick={() => restoreClientMutation.mutate({ id: client.id })}
                              >
                                {restoreClientMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                Restore
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 text-xs border-slate-300 text-slate-600 hover:bg-slate-100 bg-white"
                                disabled={markNotInterestedMutation.isPending}
                                onClick={() => markNotInterestedMutation.mutate({ id: client.id })}
                              >
                                {markNotInterestedMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                                Not Interested
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                Page {page} of {totalPages} ({totalCount} clients)
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 w-8 p-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-8 w-8 p-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Client Dialog */}
      <AddClientDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={() => { utils.admin.list.invalidate(); utils.admin.filterCounts.invalidate(); }}
      />

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} client{selectedIds.size === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} client record{selectedIds.size === 1 ? '' : 's'} and all associated data (documents, notes, tasks). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) })}
            >
              Delete {selectedIds.size} client{selectedIds.size === 1 ? '' : 's'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
