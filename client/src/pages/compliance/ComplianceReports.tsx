import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Download, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Reports workspace. The catalog is filtered server-side to reports the caller
 * may run; exports require the EXPORT permission and are recorded as an audit
 * event. Exported files are sensitive — treat them as restricted records.
 */
export default function ComplianceReports() {
  const catalog = trpc.compliance.reports.list.useQuery();
  const [active, setActive] = useState<string | null>(null);
  const report = trpc.compliance.reports.run.useQuery({ key: active ?? "" }, { enabled: !!active, retry: false });
  const exportCsv = trpc.compliance.reports.exportCsv.useMutation({
    onSuccess: (r) => {
      const blob = new Blob([r.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${r.rows} row(s)`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-green-700" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-slate-900">Compliance Reports</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          {/* Catalog */}
          <div className="space-y-2">
            {catalog.isLoading && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>}
            {catalog.isError && <p className="text-sm text-slate-500">Unable to load (database unavailable).</p>}
            {(catalog.data ?? []).map((d) => (
              <Card key={d.key} className={`cursor-pointer transition-colors ${active === d.key ? "border-green-500" : "hover:border-green-300"}`} onClick={() => setActive(d.key)}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">{d.title}</CardTitle>
                  <p className="text-xs text-slate-500">{d.description}</p>
                </CardHeader>
              </Card>
            ))}
            {catalog.data && catalog.data.length === 0 && <p className="text-sm text-slate-500">No reports available for your role.</p>}
          </div>

          {/* Result */}
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{active ? (catalog.data?.find((d) => d.key === active)?.title ?? active) : "Select a report"}</CardTitle>
              {active && (
                <Button size="sm" variant="outline" className="gap-1" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate({ key: active })}>
                  {exportCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />} Export CSV
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!active && <p className="text-sm text-slate-500 flex items-center gap-1"><Play className="h-4 w-4" aria-hidden="true" /> Choose a report from the left to run it.</p>}
              {active && report.isLoading && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Running…</div>}
              {active && report.isError && <p className="text-sm text-slate-500">Unable to run (database unavailable or not permitted).</p>}
              {active && report.data && (
                report.data.rows.length === 0
                  ? <p className="text-sm text-slate-500">No rows.</p>
                  : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b text-left">{report.data.columns.map((c) => <th key={c} className="py-1.5 pr-4 font-medium text-slate-600">{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {report.data.rows.slice(0, 500).map((row, i) => (
                            <tr key={i} className="border-b last:border-0">
                              {report.data!.columns.map((c) => <td key={c} className="py-1.5 pr-4 text-slate-700">{formatCell((row as Record<string, unknown>)[c])}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {report.data.rows.length > 500 && <p className="mt-2 text-xs text-slate-500">Showing first 500 of {report.data.rows.length} rows — export CSV for the full set.</p>}
                    </div>
                  )
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v);
}
