import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, ExternalLink, Loader2, CheckCircle2, RefreshCw, CreditCard, Phone } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// Use inferred types from tRPC
type DupGroup = {
  matchKey: string;
  matchType: string;
  count: number;
  records: Array<{
    id: number;
    firstName: string;
    lastName: string;
    medicaidId?: string | null;
    cellPhone?: string | null;
    email?: string | null;
    createdAt?: Date | null;
    stage?: string | null;
    status?: string | null;
    supermarket?: string | null;
    neighborhood?: string | null;
  }>;
};
type DupRecord = DupGroup['records'][number];

export default function AdminDuplicates() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: rawGroups, isLoading, refetch } = trpc.admin.getDuplicates.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const groups = rawGroups as unknown as DupGroup[] | undefined;

  const deleteMutation = trpc.admin.deleteDuplicate.useMutation({
    onSuccess: () => {
      utils.admin.getDuplicates.invalidate();
      toast.success("Record deleted", { description: "The duplicate record has been removed." });
    },
    onError: (err) => {
      toast.error("Delete failed", { description: err.message });
    },
  });

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Deduplicate groups that appear in both medicaid and phone scans
  const deduped: DupGroup[] = groups ? (() => {
    const seen = new Set<string>();
    return groups.filter((g: DupGroup) => {
      // For phone duplicates, skip if same IDs already shown under medicaid
      const key = [...(g.records || [])].map((r: DupRecord) => r.id).sort().join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })() : [];

  const totalFlagged = deduped.reduce((sum: number, g: DupGroup) => sum + (g.records?.length ?? 0), 0);
  const extraRecords = deduped.reduce((sum: number, g: DupGroup) => sum + Math.max(0, (g.records?.length ?? 0) - 1), 0);

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h1 className="text-xl font-bold text-slate-800">Duplicate Scan</h1>
            </div>
            <p className="text-sm text-slate-500">
              Clients flagged for duplicate Medicaid ID or phone number. Review each group and delete the extra record(s).
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Re-scan
          </Button>
        </div>

        {/* Summary bar */}
        {!isLoading && (
          <div className={`rounded-lg p-4 mb-6 flex items-center gap-4 ${deduped.length === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
            {deduped.length === 0 ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <p className="text-sm font-medium text-green-800">No duplicates found — all client records are unique.</p>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {deduped.length} duplicate group{deduped.length !== 1 ? "s" : ""} found
                    &nbsp;·&nbsp; {totalFlagged} flagged records
                    &nbsp;·&nbsp; {extraRecords} extra record{extraRecords !== 1 ? "s" : ""} to review
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    The <strong>oldest</strong> record in each group is likely the original. Delete the newer duplicate(s) after confirming.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        )}

        {/* Duplicate groups */}
        {!isLoading && deduped.map((group: DupGroup, gi: number) => (
          <div key={gi} className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
            {/* Group header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
              {group.matchType === "medicaid" ? (
                <CreditCard className="h-4 w-4 text-red-500 shrink-0" />
              ) : (
                <Phone className="h-4 w-4 text-amber-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-slate-700">
                  {group.matchType === "medicaid" ? "Same Medicaid ID" : "Same Phone Number"}:&nbsp;
                  <code className="font-mono text-xs bg-slate-200 px-1.5 py-0.5 rounded">{group.matchKey}</code>
                </span>
              </div>
              <Badge variant="destructive" className="text-xs shrink-0">
                {group.count} records
              </Badge>
            </div>

            {/* Records */}
            <div className="divide-y divide-slate-100">
              {(group.records || []).map((rec: DupRecord, ri: number) => (
                <div key={rec.id} className={`flex items-start gap-4 px-4 py-3 ${ri === 0 ? "bg-green-50/40" : ""}`}>
                  {/* Index badge */}
                  <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${ri === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {ri === 0 ? "✓" : ri + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800 text-sm capitalize">
                        {rec.firstName} {rec.lastName}
                      </span>
                      {ri === 0 && <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 bg-green-50">Original</Badge>}
                      {ri > 0 && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">Duplicate</Badge>}
                      <Badge variant="secondary" className="text-[10px]">{rec.stage}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                      <span>ID #{rec.id}</span>
                      {rec.medicaidId && <span>Medicaid: {rec.medicaidId}</span>}
                      {rec.cellPhone && <span>Phone: {rec.cellPhone}</span>}
                      {rec.supermarket && <span>Vendor: {rec.supermarket}</span>}
                      {rec.neighborhood && <span>Area: {rec.neighborhood}</span>}
                      {rec.createdAt && <span>Submitted: {new Date(rec.createdAt).toLocaleDateString()}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-slate-500 hover:text-slate-800"
                      onClick={() => navigate(`/admin/application/${rec.id}`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    {ri > 0 && (
                      confirmDelete === rec.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 text-xs px-2"
                            disabled={deleteMutation.isPending}
                            onClick={() => { deleteMutation.mutate({ id: rec.id }); setConfirmDelete(null); }}
                          >
                            {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm Delete"}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-xs px-2" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setConfirmDelete(rec.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
