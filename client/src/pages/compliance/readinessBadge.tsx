import { READINESS_LABELS, type ReadinessStatus } from "@shared/compliance/constants";
import { CheckCircle2, Clock, PauseCircle, Search, XCircle, AlertTriangle } from "lucide-react";

/**
 * Readiness status presented as icon + text (never color alone — WCAG 1.4.1).
 * Color is a redundant cue only.
 */
export function ReadinessBadge({ status }: { status: ReadinessStatus }) {
  const label = READINESS_LABELS[status];
  const { Icon, cls } = presentation(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${cls}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function presentation(status: ReadinessStatus): { Icon: typeof CheckCircle2; cls: string } {
  switch (status) {
    case "ready_for_service":
      return { Icon: CheckCircle2, cls: "border-green-300 bg-green-50 text-green-800" };
    case "under_audit":
      return { Icon: Search, cls: "border-purple-300 bg-purple-50 text-purple-800" };
    case "service_hold":
    case "billing_hold":
      return { Icon: PauseCircle, cls: "border-red-300 bg-red-50 text-red-800" };
    case "inactive":
      return { Icon: XCircle, cls: "border-slate-300 bg-slate-100 text-slate-700" };
    case "evidence_missing":
    case "compliance_review_pending":
    case "clinical_review_pending":
      return { Icon: AlertTriangle, cls: "border-amber-300 bg-amber-50 text-amber-800" };
    default:
      return { Icon: Clock, cls: "border-blue-300 bg-blue-50 text-blue-800" };
  }
}
