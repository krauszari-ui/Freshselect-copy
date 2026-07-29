import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ReadinessBadge } from "./readinessBadge";
import { ShieldCheck, ChevronRight } from "lucide-react";

/**
 * Compact, self-contained compliance banner embedded in the existing client
 * detail header. Renders nothing unless the compliance module is enabled, so it
 * is safe to drop into the existing page without changing current behavior.
 */
export function ComplianceInlineBanner({ submissionId }: { submissionId: number }) {
  const flags = trpc.compliance.flags.useQuery(undefined, { staleTime: 60_000 });
  const enabled = flags.data?.module === true;
  const readiness = trpc.compliance.readiness.get.useQuery({ submissionId }, { enabled: enabled && submissionId > 0, retry: false });

  if (!enabled) return null;

  return (
    <Link href={`/admin/compliance/clients/${submissionId}`}>
      <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm hover:border-green-400 transition-colors cursor-pointer">
        <ShieldCheck className="h-4 w-4 text-green-700" aria-hidden="true" />
        <span className="text-slate-700">Compliance:</span>
        {readiness.data ? <ReadinessBadge status={readiness.data.status} /> : <span className="text-slate-500">not computed</span>}
        <span className="text-green-700 inline-flex items-center">Open record <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
      </div>
    </Link>
  );
}
