import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Users, BarChart3, Store, MapPin, Layers, RefreshCw, AlertCircle, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { toast } from "sonner";

const STAGE_LABELS: Record<string, string> = {
  referral: "Referral",
  assessment: "Assessment",
  active: "Active",
  inactive: "Inactive",
  ineligible: "Ineligible",
  waitlist: "Waitlist",
  pending: "Pending",
};

const STAGE_COLORS: Record<string, string> = {
  referral: "bg-blue-500",
  assessment: "bg-amber-500",
  active: "bg-emerald-500",
  inactive: "bg-slate-400",
  ineligible: "bg-red-400",
  waitlist: "bg-purple-400",
  pending: "bg-orange-400",
};

function CompletionRow({
  label,
  total: rawTotal,
  completed: rawCompleted,
  pending: rawPending,
  color = "bg-emerald-500",
}: {
  label: string;
  total: number;
  completed: number;
  pending: number;
  color?: string;
}) {
  const total = Number(rawTotal) || 0;
  const completed = Number(rawCompleted) || 0;
  const pending = Number(rawPending) || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-slate-800 truncate">{label}</span>
          <span className="text-xs text-slate-500 ml-2 shrink-0">{completed}/{total}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${color}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-600 w-10 text-right">{pct}%</span>
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Badge variant="outline" className="text-xs h-5 px-1.5 border-emerald-200 text-emerald-700 bg-emerald-50">
          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{completed}
        </Badge>
        <Badge variant="outline" className="text-xs h-5 px-1.5 border-amber-200 text-amber-700 bg-amber-50">
          <Clock className="h-2.5 w-2.5 mr-0.5" />{pending}
        </Badge>
      </div>
    </div>
  );
}

async function exportAssessmentReportPDF(data: {
  grandTotal: number;
  grandCompleted: number;
  grandPending: number;
  byStage: Record<string, { total: number; completed: number; pending: number }>;
  byVendor: Record<string, { total: number; completed: number; pending: number }>;
  byNeighborhood: Record<string, { total: number; completed: number; pending: number }>;
}) {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const PAGE_W  = 595;
  const PAGE_H  = 842;
  const MARGIN  = 45;
  const COL_W   = PAGE_W - MARGIN * 2;
  const LINE_H  = 16;

  const colorGreen  = rgb(0.13, 0.55, 0.33);
  const colorAmber  = rgb(0.85, 0.55, 0.10);
  const colorSlate  = rgb(0.35, 0.40, 0.47);
  const colorBlack  = rgb(0.10, 0.10, 0.12);
  const colorLight  = rgb(0.94, 0.96, 0.98);
  const colorBorder = rgb(0.86, 0.88, 0.92);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawFooter = () => {
    page.drawLine({ start: { x: MARGIN, y: MARGIN + 14 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 14 }, thickness: 0.5, color: colorBorder });
    page.drawText(`FreshSelect Meals SCN — Confidential — ${new Date().toLocaleDateString()}`, { x: MARGIN, y: MARGIN + 4, size: 7, font: fontReg, color: colorSlate });
    page.drawText(`Page ${pdfDoc.getPageCount()}`, { x: PAGE_W - MARGIN - 30, y: MARGIN + 4, size: 7, font: fontReg, color: colorSlate });
  };

  const addPage = () => {
    drawFooter();
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 30) addPage();
  };

  const drawSectionHeader = (title: string) => {
    ensureSpace(28);
    y -= 6;
    page.drawRectangle({ x: MARGIN, y: y - 18, width: COL_W, height: 22, color: colorLight, borderColor: colorBorder, borderWidth: 0.5 });
    page.drawText(title, { x: MARGIN + 8, y: y - 12, size: 10, font: fontBold, color: colorBlack });
    y -= 26;
  };

  const drawTableRow = (label: string, completed: number | string, pending: number | string, total: number | string, isHeader = false) => {
    ensureSpace(LINE_H + 2);
    const tot = Number(total) || 0;
    const com = Number(completed) || 0;
    const pen = Number(pending) || 0;
    const pct = tot > 0 ? Math.round((com / tot) * 100) : 0;
    const font = isHeader ? fontBold : fontReg;
    const textColor = isHeader ? colorBlack : colorSlate;

    if (isHeader) {
      page.drawRectangle({ x: MARGIN, y: y - LINE_H + 3, width: COL_W, height: LINE_H, color: rgb(0.88, 0.90, 0.94) });
    }

    page.drawText(String(label), { x: MARGIN + 4, y: y - 9, size: 8, font, color: textColor, maxWidth: COL_W * 0.40 });
    page.drawText(String(completed), { x: MARGIN + COL_W * 0.60, y: y - 9, size: 8, font, color: isHeader ? colorBlack : colorGreen });
    page.drawText(String(pending),   { x: MARGIN + COL_W * 0.72, y: y - 9, size: 8, font, color: isHeader ? colorBlack : colorAmber });
    page.drawText(String(total),     { x: MARGIN + COL_W * 0.84, y: y - 9, size: 8, font, color: textColor });
    page.drawText(isHeader ? "%" : `${pct}%`, { x: MARGIN + COL_W * 0.93, y: y - 9, size: 8, font, color: isHeader ? colorBlack : colorGreen });

    if (!isHeader) {
      const barX = MARGIN + COL_W * 0.44;
      const barW = COL_W * 0.14;
      const barY = y - 8;
      page.drawRectangle({ x: barX, y: barY, width: barW, height: 4, color: colorLight });
      if (pct > 0) page.drawRectangle({ x: barX, y: barY, width: barW * (pct / 100), height: 4, color: colorGreen });
      page.drawLine({ start: { x: MARGIN, y: y - LINE_H + 2 }, end: { x: PAGE_W - MARGIN, y: y - LINE_H + 2 }, thickness: 0.3, color: colorBorder });
    }

    y -= LINE_H;
  };

  // ── Title block ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: colorGreen });
  page.drawText("FreshSelect Meals SCN", { x: MARGIN, y: PAGE_H - 28, size: 14, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Assessment Completion Report", { x: MARGIN, y: PAGE_H - 46, size: 11, font: fontReg, color: rgb(0.85, 0.95, 0.88) });
  page.drawText(`Generated: ${new Date().toLocaleString()}`, { x: MARGIN, y: PAGE_H - 62, size: 8, font: fontReg, color: rgb(0.75, 0.90, 0.80) });
  y = PAGE_H - 85;

  // ── Summary cards ────────────────────────────────────────────────────────
  const grandTotal     = Number(data.grandTotal) || 0;
  const grandCompleted = Number(data.grandCompleted) || 0;
  const grandPending   = Number(data.grandPending) || 0;
  const grandPct       = grandTotal > 0 ? Math.round((grandCompleted / grandTotal) * 100) : 0;

  const cardW = (COL_W - 12) / 3;
  [
    { label: "Total Clients",         value: String(grandTotal),     color: colorSlate },
    { label: "Assessments Completed", value: String(grandCompleted), color: colorGreen },
    { label: "Pending Assessment",    value: String(grandPending),   color: colorAmber },
  ].forEach((c, i) => {
    const cx = MARGIN + i * (cardW + 6);
    page.drawRectangle({ x: cx, y: y - 44, width: cardW, height: 48, color: colorLight, borderColor: colorBorder, borderWidth: 0.5 });
    page.drawText(c.value, { x: cx + 8, y: y - 20, size: 18, font: fontBold, color: c.color });
    page.drawText(c.label, { x: cx + 8, y: y - 36, size: 7.5, font: fontReg, color: colorSlate });
  });
  y -= 56;

  // Overall progress bar
  y -= 8;
  page.drawText(`Overall Completion Rate: ${grandPct}%`, { x: MARGIN, y, size: 9, font: fontBold, color: colorBlack });
  y -= 10;
  page.drawRectangle({ x: MARGIN, y: y - 6, width: COL_W, height: 8, color: colorLight, borderColor: colorBorder, borderWidth: 0.3 });
  if (grandPct > 0) page.drawRectangle({ x: MARGIN, y: y - 6, width: COL_W * (grandPct / 100), height: 8, color: colorGreen });
  page.drawText(`${grandCompleted} completed`, { x: MARGIN, y: y - 18, size: 7.5, font: fontReg, color: colorSlate });
  page.drawText(`${grandPending} pending`, { x: PAGE_W - MARGIN - 50, y: y - 18, size: 7.5, font: fontReg, color: colorSlate });
  y -= 28;

  // ── By Stage ─────────────────────────────────────────────────────────────
  drawSectionHeader("By Stage");
  drawTableRow("Stage", "Completed", "Pending", "Total", true);
  Object.entries(data.byStage)
    .filter(([s]) => s && s !== "null" && s !== "undefined")
    .sort((a, b) => Number(b[1].total) - Number(a[1].total))
    .forEach(([stage, c]) => drawTableRow(STAGE_LABELS[stage] || stage, c.completed, c.pending, c.total));

  // ── By Vendor ────────────────────────────────────────────────────────────
  y -= 10;
  drawSectionHeader("By Vendor / Supermarket");
  drawTableRow("Vendor", "Completed", "Pending", "Total", true);
  Object.entries(data.byVendor)
    .sort((a, b) => Number(b[1].total) - Number(a[1].total))
    .forEach(([vendor, c]) => drawTableRow(vendor, c.completed, c.pending, c.total));

  // ── By Neighborhood ──────────────────────────────────────────────────────
  y -= 10;
  drawSectionHeader("By Neighborhood");
  drawTableRow("Neighborhood", "Completed", "Pending", "Total", true);
  Object.entries(data.byNeighborhood)
    .sort((a, b) => Number(b[1].total) - Number(a[1].total))
    .forEach(([hood, c]) => drawTableRow(hood, c.completed, c.pending, c.total));

  drawFooter();

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob(
    [pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer],
    { type: "application/pdf" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `freshselect-assessment-report-${new Date().toISOString().split("T")[0]}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).replace(/"/g, '""');
  return /[,"\n\r]/.test(s) ? `"${s}"` : s;
}

function downloadCSV(rows: unknown[][], filename: string) {
  const csv = rows.map(r => r.map(escapeCSV).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAssessmentReport() {
  const { data, isLoading, isError, error, refetch } = trpc.admin.assessmentReport.useQuery();
  const [pdfExporting, setPdfExporting] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const exportQuery = trpc.admin.exportCompletedAssessments.useQuery(undefined, { enabled: false });

  const handleExportCSV = async () => {
    setCsvExporting(true);
    try {
      const result = await exportQuery.refetch();
      const clients = (result.data ?? []) as any[];
      if (clients.length === 0) { toast.info("No completed assessments to export."); return; }

      const headers = [
        "Reference #", "First Name", "Last Name", "Date of Birth", "Medicaid ID",
        "Cell Phone", "Home Phone", "Email",
        "Street Address", "Apt/Unit", "City", "State", "Zipcode", "Neighborhood", "Borough",
        "Stage", "Status", "Supermarket",
        "Health Categories", "Due Date", "Miscarriage Date",
        "Infant Name", "Infant DOB", "Infant Medicaid ID",
        "Employed", "Spouse Employed", "Has WIC", "Has SNAP",
        "New Applicant", "Transfer Agency",
        "Household Members Count", "Food Allergies", "Dietary Restrictions",
        "Meal Focus", "Needs Refrigerator", "Needs Microwave", "Needs Cooking Utensils",
        "Guardian Name", "HIPAA Consent At",
        "Assessment Completed At", "Assessment Completed By",
        "Referral Source", "Intake Rep", "Assigned Worker",
        "Created At", "Updated At",
        // SCN Screening
        "SCN: Living Situation", "SCN: Utility Shutoff", "SCN: Receives SNAP", "SCN: Receives WIC",
        "SCN: Household Members Count", "SCN: Members with Medicaid",
        "SCN: Needs Work Assistance", "SCN: Wants School Help", "SCN: Transportation Barrier",
        "SCN: Medications Require Refrigeration", "SCN: Pregnant/Postpartum", "SCN: Breastmilk Refrigeration",
      ];

      const rows = clients.map((c: any) => {
        const fd = (c.formData ?? {}) as any;
        const sq = fd.screeningQuestions ?? fd.screening ?? {};
        return [
          c.referenceNumber, c.firstName, c.lastName, c.dateOfBirth, c.medicaidId,
          c.cellPhone, c.homePhone, c.email,
          c.streetAddress, c.aptUnit, c.city, c.state, c.zipcode, c.neighborhood, c.borough,
          c.stage, c.status, c.supermarket,
          (fd.healthCategories ?? []).join("; "),
          fd.dueDate, fd.miscarriageDate,
          fd.infantName, fd.infantDateOfBirth, fd.infantMedicaidId,
          fd.employed, fd.spouseEmployed, fd.hasWic, fd.hasSnap,
          fd.newApplicant, fd.transferAgencyName,
          c.additionalMembersCount, fd.foodAllergiesDetails ?? fd.foodAllergies, fd.dietaryRestrictions,
          (fd.mealFocus ?? []).join("; "),
          fd.needsRefrigerator, fd.needsMicrowave, fd.needsCookingUtensils,
          fd.guardianName,
          c.hipaaConsentAt ? new Date(c.hipaaConsentAt).toLocaleString() : "",
          c.assessmentCompletedAt ? new Date(c.assessmentCompletedAt).toLocaleString() : "",
          c.assessmentCompletedBy,
          c.referralSource, c.intakeRep, c.assignedWorker,
          c.createdAt ? new Date(c.createdAt).toLocaleString() : "",
          c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "",
          sq.livingSituation, sq.utilityShutoff, sq.receivesSnap, sq.receivesWic,
          sq.householdMembersCount, sq.householdMembersWithMedicaid,
          sq.needsWorkAssistance, sq.wantsSchoolHelp ?? sq.wantsSchoolTraining, sq.transportationBarrier,
          sq.medicationsRequireRefrigeration, sq.pregnantOrPostpartum, sq.breastmilkRefrigeration,
        ];
      });

      downloadCSV([headers, ...rows], `freshselect-completed-assessments-${new Date().toISOString().split("T")[0]}.csv`);
      toast.success(`Exported ${clients.length} completed assessment${clients.length !== 1 ? "s" : ""}`);
    } catch (err: any) {
      toast.error("CSV export failed: " + (err?.message || "Unknown error"));
    } finally {
      setCsvExporting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!data) return;
    setPdfExporting(true);
    try {
      await exportAssessmentReportPDF({
        grandTotal:     Number((data as any).grandTotal) || 0,
        grandCompleted: Number((data as any).grandCompleted) || 0,
        grandPending:   Number((data as any).grandPending) || 0,
        byStage:        ((data as any).byStage || {}) as Record<string, { total: number; completed: number; pending: number }>,
        byVendor:       ((data as any).byVendor || {}) as Record<string, { total: number; completed: number; pending: number }>,
        byNeighborhood: ((data as any).byNeighborhood || {}) as Record<string, { total: number; completed: number; pending: number }>,
      });
      toast.success("Assessment report exported to PDF");
    } catch (err: any) {
      console.error(err);
      toast.error("PDF export failed: " + (err?.message || "Unknown error"));
    } finally {
      setPdfExporting(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </AdminLayout>
    );
  }

  if (isError) {
    return (
      <AdminLayout>
        <div className="p-6 flex flex-col items-center justify-center min-h-[300px] gap-4">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <div className="text-center">
            <p className="text-slate-700 font-medium">Failed to load assessment report</p>
            <p className="text-sm text-slate-500 mt-1">{(error as any)?.message || "An error occurred"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </AdminLayout>
    );
  }

  if (!data) return <AdminLayout><div className="p-6 text-slate-500">No data available</div></AdminLayout>;

  const grandTotal = Number((data as any).grandTotal) || 0;
  const grandCompleted = Number((data as any).grandCompleted) || 0;
  const grandPending = Number((data as any).grandPending) || 0;
  const byStage = (data as any).byStage || {};
  const byVendor = (data as any).byVendor || {};
  const byNeighborhood = (data as any).byNeighborhood || {};
  const grandPct = grandTotal > 0 ? Math.round((grandCompleted / grandTotal) * 100) : 0;

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-emerald-600" />
              Assessment Completion Report
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Overview of SCN screening assessment completion across all clients
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={csvExporting}
              className="gap-2 border-teal-600 text-teal-700 hover:bg-teal-50 shrink-0"
            >
              {csvExporting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              {csvExporting ? "Exporting..." : "Export CSV"}
            </Button>
            <Button
              onClick={handleDownloadPDF}
              disabled={pdfExporting || !data}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
            >
              {pdfExporting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {pdfExporting ? "Generating..." : "Download PDF"}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-slate-200">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">{grandTotal}</div>
                  <div className="text-xs text-slate-500">Total Clients</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-700">{grandCompleted}</div>
                  <div className="text-xs text-emerald-600">Assessments Completed</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-700">{grandPending}</div>
                  <div className="text-xs text-amber-600">Pending Assessment</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Overall Progress Bar */}
        <Card className="border-slate-200">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">Overall Completion Rate</span>
              <span className="text-lg font-bold text-emerald-600">{grandPct}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${grandPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-slate-400">
              <span>{grandCompleted} completed</span>
              <span>{grandPending} pending</span>
            </div>
          </CardContent>
        </Card>

        {/* By Stage */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-500" />
              By Stage
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {Object.entries(byStage)
              .sort((a: any, b: any) => b[1].total - a[1].total)
              .filter(([stage]) => stage && stage !== 'null' && stage !== 'undefined')
              .map(([stage, counts]: any) => (
                <CompletionRow
                  key={stage}
                  label={STAGE_LABELS[stage] || stage}
                  total={counts.total}
                  completed={counts.completed}
                  pending={counts.pending}
                  color={STAGE_COLORS[stage] || "bg-slate-400"}
                />
              ))}
          </CardContent>
        </Card>

        {/* By Vendor */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Store className="h-4 w-4 text-purple-500" />
              By Vendor / Supermarket
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {Object.entries(byVendor)
              .sort((a: any, b: any) => b[1].total - a[1].total)
              .map(([vendor, counts]: any) => (
                <CompletionRow
                  key={vendor}
                  label={vendor}
                  total={counts.total}
                  completed={counts.completed}
                  pending={counts.pending}
                  color="bg-purple-500"
                />
              ))}
          </CardContent>
        </Card>

        {/* By Neighborhood */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-rose-500" />
              By Neighborhood
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {Object.entries(byNeighborhood)
              .sort((a: any, b: any) => b[1].total - a[1].total)
              .map(([hood, counts]: any) => (
                <CompletionRow
                  key={hood}
                  label={hood}
                  total={counts.total}
                  completed={counts.completed}
                  pending={counts.pending}
                  color="bg-rose-500"
                />
              ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
