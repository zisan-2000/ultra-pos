"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Filter, Search, ShieldCheck } from "lucide-react";
import { getAuditActionLabel, AUDIT_SEVERITY_LABELS } from "@/lib/audit/actions";
import AuditLogRow, { type AuditLogItem } from "./AuditLogRow";
import AuditDetailModal from "./AuditDetailModal";

type ShopOption = { id: string; name: string };
type Cursor = { cursorAt: string; cursorId: string } | null;

type ApiResponse = {
  items: AuditLogItem[];
  hasMore: boolean;
  nextCursor: Cursor;
  facets: {
    severityCounts: Record<string, number>;
    users: Array<{ userId: string | null; userName: string | null }>;
    actions: string[];
  };
};

type Props = {
  shops: ShopOption[];
  initialShopId: string;
  initialFrom: string;
  initialTo: string;
};

const severityOptions = [
  { value: "", label: "সব severity" },
  { value: "info", label: "তথ্য" },
  { value: "warning", label: "সতর্কতা" },
  { value: "critical", label: "গুরুত্বপূর্ণ" },
];

function buildQuery(params: Record<string, string | null | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) qs.set(key, value);
  });
  return qs.toString();
}

export default function AuditLogClient({
  shops,
  initialShopId,
  initialFrom,
  initialTo,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [shopId, setShopId] = useState(searchParams.get("shopId") || initialShopId);
  const [from, setFrom] = useState(searchParams.get("from") || initialFrom);
  const [to, setTo] = useState(searchParams.get("to") || initialTo);
  const [action, setAction] = useState(searchParams.get("action") || "");
  const [severity, setSeverity] = useState(searchParams.get("severity") || "");
  const [userId, setUserId] = useState(searchParams.get("userId") || "");
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [facets, setFacets] = useState<ApiResponse["facets"]>({
    severityCounts: {},
    users: [],
    actions: [],
  });
  const [nextCursor, setNextCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<AuditLogItem | null>(null);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const baseParams = useMemo(
    () => ({ shopId, from, to, action, severity, userId, q }),
    [shopId, from, to, action, severity, userId, q],
  );

  const fetchPage = useCallback(
    (cursor?: Cursor, append = false) => {
      startLoading(async () => {
        setError(null);
        try {
          const qs = buildQuery({
            ...baseParams,
            cursorAt: cursor?.cursorAt,
            cursorId: cursor?.cursorId,
          });
          const res = await fetch(`/api/audit/list?${qs}`, {
            cache: "no-store",
          });

          // Read body as text first so non-JSON server errors (HTML 500
          // pages, redirects, empty bodies) don't crash res.json().
          const raw = await res.text();
          let data: (ApiResponse & { error?: string }) | null = null;
          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = null;
            }
          }

          if (!res.ok) {
            throw new Error(
              data?.error || `Audit log load failed (HTTP ${res.status})`,
            );
          }
          if (!data) {
            throw new Error("Server returned an empty or invalid response");
          }

          setItems((prev) => (append ? [...prev, ...data.items] : data.items));
          setFacets(data.facets);
          setNextCursor(data.nextCursor);
          setHasMore(data.hasMore);
        } catch (err: any) {
          setError(err?.message || "Audit log load failed");
        }
      });
    },
    [baseParams],
  );

  useEffect(() => {
    const qs = buildQuery(baseParams);
    router.replace(`/dashboard/audit?${qs}`, { scroll: false });
    fetchPage(null, false);
  }, [baseParams, fetchPage, router]);

  const exportHref = `/api/audit/export?${buildQuery(baseParams)}`;
  const criticalCount = facets.severityCounts.critical ?? 0;
  const warningCount = facets.severityCounts.warning ?? 0;
  const infoCount = facets.severityCounts.info ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-slate-50 shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
              Accountability
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              অডিট লগ
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600">
              কে কখন বিক্রি, খরচ, স্টক, দাম বা permission বদলেছে তা append-only timeline-এ দেখা যাবে।
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <div className="rounded-2xl bg-white/80 p-3 text-center shadow-sm">
              <p className="text-[11px] font-bold text-slate-500">Critical</p>
              <p className="text-xl font-black text-rose-600">{criticalCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 text-center shadow-sm">
              <p className="text-[11px] font-bold text-slate-500">Warning</p>
              <p className="text-xl font-black text-amber-600">{warningCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 text-center shadow-sm">
              <p className="text-[11px] font-bold text-slate-500">Info</p>
              <p className="text-xl font-black text-emerald-600">{infoCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-foreground">
          <Filter className="h-4 w-4 text-emerald-600" />
          ফিল্টার
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
          <select value={shopId} onChange={(e) => setShopId(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold xl:col-span-2">
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>{shop.name}</option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold" />
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold">
            {severityOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold">
            <option value="">সব action</option>
            {facets.actions.map((value) => (
              <option key={value} value={value}>{getAuditActionLabel(value)}</option>
            ))}
          </select>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold">
            <option value="">সব user</option>
            {facets.users.filter((u) => u.userId).map((u) => (
              <option key={u.userId!} value={u.userId!}>{u.userName || u.userId}</option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="summary, action, target, user দিয়ে খুঁজুন..."
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-semibold"
            />
          </label>
          <a
            href={exportHref}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700 hover:bg-emerald-100"
          >
            <Download className="h-4 w-4" />
            CSV Export
          </a>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm font-bold text-danger">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-black text-foreground">
              Timeline {loading ? "· আপডেট হচ্ছে..." : ""}
            </p>
          </div>
          <p className="text-xs font-bold text-muted-foreground">{items.length} row loaded</p>
        </div>
        {items.length === 0 && !loading ? (
          <div className="p-10 text-center">
            <p className="text-lg font-black text-foreground">এই filter-এ audit log নেই</p>
            <p className="mt-1 text-sm text-muted-foreground">অন্য date/action filter দিয়ে দেখুন।</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <AuditLogRow key={item.id} item={item} onOpen={() => setSelected(item)} />
            ))}
          </div>
        )}
        {hasMore ? (
          <div className="border-t border-border p-4 text-center">
            <button
              type="button"
              onClick={() => fetchPage(nextCursor, true)}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-black text-background disabled:opacity-60"
            >
              {loading ? "লোড হচ্ছে..." : "আরও দেখুন"}
            </button>
          </div>
        ) : null}
      </section>

      <AuditDetailModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

