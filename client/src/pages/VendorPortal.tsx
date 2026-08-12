import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, Truck, CheckCircle2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { isoWeekStart, weekOfIso } from "@shared/compliance/week";

/**
 * Vendor proof-of-delivery portal. A delivery-vendor account sees the week's
 * active clients and attaches a PoD link per client. Minimal client info only.
 */
export default function VendorPortal() {
  const { user, loading, logout } = useAuth();
  const [weekDate, setWeekDate] = useState(() => isoWeekStart(new Date()));

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!user) { window.location.href = getLoginUrl(); return null as never; }

  const weekOfStr = weekOfIso(weekDate);
  const weekEnd = new Date(weekDate); weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const shiftWeek = (deltaDays: number) => { const d = new Date(weekDate); d.setUTCDate(d.getUTCDate() + deltaDays); setWeekDate(isoWeekStart(d)); };

  return <VendorPortalInner weekOfStr={weekOfStr} weekDate={weekDate} weekEnd={weekEnd} shiftWeek={shiftWeek} setWeekDate={setWeekDate} logout={logout} />;
}

function VendorPortalInner({ weekOfStr, weekDate, weekEnd, shiftWeek, setWeekDate, logout }: {
  weekOfStr: string; weekDate: Date; weekEnd: Date; shiftWeek: (d: number) => void; setWeekDate: (d: Date) => void; logout: () => void;
}) {
  const vendor = trpc.compliance.vendor.myVendor.useQuery(undefined, { retry: false });
  const clients = trpc.compliance.vendor.weeklyClients.useQuery({ weekOf: weekDate });

  // Not a vendor account (or portal disabled) → myVendor errors.
  if (vendor.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-3 max-w-sm p-8 bg-card rounded-xl border shadow-sm">
          <Truck className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-semibold">Vendor portal unavailable</h2>
          <p className="text-sm text-muted-foreground">This account is not set up as a delivery vendor, or the vendor portal is not enabled. Please contact your administrator.</p>
          <Button variant="outline" onClick={() => logout()}>Sign Out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-green-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5" aria-hidden="true" />
            <span className="font-semibold">{vendor.data?.name ?? "Vendor"} — Proof of Delivery</span>
          </div>
          <Button variant="ghost" size="sm" className="text-white hover:bg-green-800 gap-1" onClick={() => logout()}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Week picker */}
        <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => shiftWeek(-7)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Prev</Button>
          <div className="text-center">
            <p className="text-xs text-slate-500">Delivery week</p>
            <p className="text-sm font-medium text-slate-800">
              {weekDate.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} – {weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
              <span className="ml-2 text-slate-400">(week of {weekOfStr})</span>
            </p>
            <input type="date" className="mt-1 text-xs text-slate-500" value={weekOfStr} onChange={(e) => { if (e.target.value) setWeekDate(isoWeekStart(new Date(e.target.value + "T00:00:00Z"))); }} />
          </div>
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => shiftWeek(7)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
        </div>

        {clients.isLoading && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading clients…</div>}
        {clients.isError && <p className="text-sm text-slate-500">Unable to load clients. Please try again.</p>}
        {clients.data && clients.data.length === 0 && <p className="text-sm text-slate-500">No active clients for this week.</p>}

        <div className="space-y-2">
          {(clients.data ?? []).map((c) => <ClientRow key={c.submissionId} client={c} weekDate={weekDate} />)}
        </div>

        <p className="text-xs text-slate-400 pt-2">
          Paste the link to your proof of delivery (a shared photo, signed manifest, or delivery-service confirmation) for each client. One proof per client per week; submitting again replaces the previous link.
        </p>
      </main>
    </div>
  );
}

type WeeklyClient = { submissionId: number; name: string; referenceNumber: string | null; borough: string | null; neighborhood: string | null; zipcode: string | null; pod: { podUrl: string | null; status: string } | null };

function ClientRow({ client, weekDate }: { client: WeeklyClient; weekDate: Date }) {
  const utils = trpc.useUtils();
  const [url, setUrl] = useState(client.pod?.podUrl ?? "");
  const submit = trpc.compliance.vendor.submitPod.useMutation({
    onSuccess: () => { utils.compliance.vendor.weeklyClients.invalidate(); toast.success("Proof of delivery saved"); },
    onError: (e) => toast.error(e.message),
  });
  const location = [client.neighborhood, client.borough, client.zipcode].filter(Boolean).join(", ");
  const hasPod = !!client.pod?.podUrl;

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-800 flex items-center gap-2">
            {client.name}
            {client.referenceNumber && <Badge variant="outline">{client.referenceNumber}</Badge>}
            {hasPod && <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Proof on file</Badge>}
          </p>
          {location && <p className="text-xs text-slate-500 mt-0.5">{location}</p>}
        </div>
        {hasPod && client.pod?.podUrl && (
          <a href={client.pod.podUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-blue-600 hover:underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" aria-hidden="true" /> View
          </a>
        )}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <Input className="h-8 flex-1" placeholder="https://… link to proof of delivery" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button size="sm" disabled={submit.isPending || !url.trim()} onClick={() => submit.mutate({ submissionId: client.submissionId, weekOf: weekDate, podUrl: url.trim() })}>
          {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : hasPod ? "Update" : "Submit"}
        </Button>
      </div>
    </div>
  );
}
