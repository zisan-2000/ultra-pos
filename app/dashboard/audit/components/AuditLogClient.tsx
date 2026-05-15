// app/dashboard/audit/components/AuditLogClient.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  Filter,
  RotateCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { getAuditActionLabel } from "@/lib/audit/actions";
import { dateBucketLabel } from "@/lib/audit/relative-time";
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

type SeverityFilter = "" | "info" | "warning" | "critical";

const SEVERITY_OPTIONS: Array<{ value: SeverityFilter; label: string }> = [
  { value: "", label: "সব severity" },
  { value: "info", label: "সাধারণ" },
  { value: "warning", label: "সতর্কতা" },
  { value: "critical", label: "গুরুত্বপূর্ণ" },
];

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const toBn = (value: number | string) =>
  String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

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
  const [shopId, setShopId] = useState(
    searchParams.get("shopId") || initialShopId,
  );
  const [from, setFrom] = useState(searchParams.get("from") || initialFrom);
  const [to, setTo] = useState(searchParams.get("to") || initialTo);
  const [action, setAction] = useState(searchParams.get("action") || "");
  const [severity, setSeverity] = useState<SeverityFilter>(
    (searchParams.get("severity") as SeverityFilter) || "",
  );
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Debounced search so we don't fire a request on every keystroke.
  const [searchDraft, setSearchDraft] = useState(q);
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchDraft !== q) setQ(searchDraft);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchDraft, q]);

  const baseParams = useMemo(
    () => ({ shopId, from, to, action, severity, userId, q }),
    [shopId, from, to, action, severity, userId, q],
  );

  // Stable JSON signature so the effect doesn't loop on object identity.
  const baseParamsKey = JSON.stringify(baseParams);

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
          // Read body as text first so non-JSON server errors don't crash res.json().
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

  // Sync URL + refetch when filters change. Use the JSON key as the
  // dependency to avoid re-running on every render.
  const lastSyncedKeyRef = useRef("");
  useEffect(() => {
    if (lastSyncedKeyRef.current === baseParamsKey) return;
    lastSyncedKeyRef.current = baseParamsKey;
    const qs = buildQuery(baseParams);
    router.replace(`/dashboard/audit?${qs}`, { scroll: false });
    fetchPage(null, false);
  }, [baseParamsKey, baseParams, fetchPage, router]);

  const exportHref = `/api/audit/export?${buildQuery(baseParams)}`;
  const criticalCount = facets.severityCounts.critical ?? 0;
  const warningCount = facets.severityCounts.warning ?? 0;
  const infoCount = facets.severityCounts.info ?? 0;
  const totalCount = criticalCount + warningCount + infoCount;

  const activeFilterCount = [severity, action, userId, q].filter(
    Boolean,
  ).length;

  // Date-bucketed grouping for the timeline.
  const groupedItems = useMemo(() => {
    const groups: Array<{ label: string; items: AuditLogItem[] }> = [];
    const today = new Date();
    let currentLabel: string | null = null;
    let currentBucket: AuditLogItem[] | null = null;
    for (const item of items) {
      const label = dateBucketLabel(item.at, today);
      if (label !== currentLabel) {
        currentLabel = label;
        currentBucket = [];
        groups.push({ label, items: currentBucket });
      }
      currentBucket!.push(item);
    }
    return groups;
  }, [items]);

  const clearFilters = () => {
    setSeverity("");
    setAction("");
    setUserId("");
    setQ("");
    setSearchDraft("");
  };

  const setSeverityChip = (value: SeverityFilter) => {
    setSeverity((prev) => (prev === value ? "" : value));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-12 sm:space-y-5">
      {/* ── Hero header ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-card to-card shadow-sm">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="relative space-y-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                জবাবদিহিতা
              </p>
              <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                অডিট লগ
              </h1>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                দোকানে কে, কখন, কোন কাজ করেছেন — বিক্রি, খরচ, স্টক, দাম বা
                permission পরিবর্তন সবকিছু এখানে timeline-এ দেখানো হবে। কোনো log
                মুছে ফেলা যায় না।
              </p>
            </div>
          </div>

          {/* Clickable stat cards */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard
              label="গুরুত্বপূর্ণ"
              count={criticalCount}
              icon={<AlertTriangle className="h-4 w-4" />}
              active={severity === "critical"}
              onClick={() => setSeverityChip("critical")}
              tone="critical"
            />
            <StatCard
              label="সতর্কতা"
              count={warningCount}
              icon={<Bell className="h-4 w-4" />}
              active={severity === "warning"}
              onClick={() => setSeverityChip("warning")}
              tone="warning"
            />
            <StatCard
              label="সাধারণ"
              count={infoCount}
              icon={<CheckCircle2 className="h-4 w-4" />}
              active={severity === "info"}
              onClick={() => setSeverityChip("info")}
              tone="info"
            />
          </div>
        </div>
      </section>

      {/* ── Search + filter bar ─────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="কে, কী, কোন বিল বা গ্রাহক — খুঁজুন..."
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-9 text-sm font-medium placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              type="search"
            />
            {searchDraft ? (
              <button
                type="button"
                onClick={() => setSearchDraft("")}
                aria-label="খালি করুন"
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:bg-muted sm:px-4"
            >
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span>ফিল্টার</span>
              {activeFilterCount > 0 ? (
                <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {toBn(activeFilterCount)}
                </span>
              ) : null}
            </button>
            <a
              href={exportHref}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary-soft px-3 text-sm font-semibold text-primary transition hover:bg-primary/15 sm:px-4"
              download
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
              <span className="sm:hidden">Export</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Error banner ────────────────────────────────────────── */}
      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <p>লোড করা যায়নি</p>
            <p className="mt-0.5 text-xs font-medium text-danger/80">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => fetchPage(null, false)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/40 bg-card px-3 text-xs font-semibold text-danger hover:bg-danger-soft"
          >
            <RotateCw className="h-3.5 w-3.5" />
            আবার চেষ্টা
          </button>
        </div>
      ) : null}

      {/* ── Timeline ────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
          <p className="text-sm font-bold text-foreground">
            টাইমলাইন
            {loading ? (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                আপডেট হচ্ছে...
              </span>
            ) : null}
          </p>
          <p className="text-xs font-semibold text-muted-foreground">
            {totalCount > 0
              ? `${toBn(items.length)} / ${toBn(totalCount)} টি দেখানো হচ্ছে`
              : `${toBn(items.length)} টি`}
          </p>
        </div>

        {items.length === 0 && !loading ? (
          <EmptyState
            hasFilters={activeFilterCount > 0}
            onClearFilters={clearFilters}
          />
        ) : items.length === 0 && loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, idx) => (
              <RowShimmer key={idx} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groupedItems.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-[1] bg-muted/40 px-4 py-1.5 backdrop-blur-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                </div>
                <div className="divide-y divide-border/70">
                  {group.items.map((item) => (
                    <AuditLogRow
                      key={item.id}
                      item={item}
                      onOpen={() => setSelected(item)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore ? (
          <div className="flex justify-center border-t border-border bg-muted/10 p-3">
            <button
              type="button"
              onClick={() => fetchPage(nextCursor, true)}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-5 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  লোড হচ্ছে...
                </>
              ) : (
                "↓ আরও দেখুন"
              )}
            </button>
          </div>
        ) : items.length > 0 ? (
          <div className="border-t border-border bg-muted/10 px-4 py-3 text-center">
            <p className="text-[11px] font-medium italic text-muted-foreground">
              সব দেখানো হয়েছে · {toBn(items.length)} টি entry
            </p>
          </div>
        ) : null}
      </section>

      {/* ── Filter drawer (mobile + desktop) ────────────────────── */}
      <FilterDrawer
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        shops={shops}
        shopId={shopId}
        onShopChange={setShopId}
        from={from}
        onFromChange={setFrom}
        to={to}
        onToChange={setTo}
        severity={severity}
        onSeverityChange={setSeverity}
        action={action}
        onActionChange={setAction}
        userId={userId}
        onUserIdChange={setUserId}
        users={facets.users}
        actions={facets.actions}
        activeFilterCount={activeFilterCount}
        onClear={clearFilters}
      />

      <AuditDetailModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ── Stat card ───────────────────────────────────────────────────

function StatCard({
  label,
  count,
  icon,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone: "critical" | "warning" | "info";
}) {
  const tonePalette = {
    critical: {
      bg: active ? "bg-rose-50" : "bg-white",
      ring: active ? "ring-rose-300" : "ring-transparent",
      number: "text-rose-700",
      icon: "text-rose-600",
    },
    warning: {
      bg: active ? "bg-amber-50" : "bg-white",
      ring: active ? "ring-amber-300" : "ring-transparent",
      number: "text-amber-700",
      icon: "text-amber-600",
    },
    info: {
      bg: active ? "bg-emerald-50" : "bg-white",
      ring: active ? "ring-emerald-300" : "ring-transparent",
      number: "text-emerald-700",
      icon: "text-emerald-600",
    },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-1 rounded-2xl border border-border p-3 text-left ring-2 transition ${tonePalette.bg} ${tonePalette.ring} hover:border-foreground/20`}
    >
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground`}
      >
        <span className={tonePalette.icon}>{icon}</span>
        {label}
      </span>
      <span
        className={`text-2xl font-extrabold tabular-nums sm:text-3xl ${tonePalette.number}`}
      >
        {toBn(count)}
      </span>
    </button>
  );
}

// ── Empty state ─────────────────────────────────────────────────

function EmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
        🗂️
      </div>
      <p className="mt-4 text-base font-bold text-foreground">
        {hasFilters
          ? "এই filter-এ কোনো log নেই"
          : "এখনো কোনো কার্যকলাপ রেকর্ড হয়নি"}
      </p>
      <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
        {hasFilters
          ? "অন্য সময় বা filter ব্যবহার করে আবার চেষ্টা করুন। সব filter মুছে দিলেও সব দেখা যাবে।"
          : "যখন কেউ বিক্রি, খরচ বা পণ্য পরিবর্তন করবে, তখন এখানে timeline তৈরি হবে।"}
      </p>
      {hasFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          সব filter মুছে দিন
        </button>
      ) : null}
    </div>
  );
}

// ── Row shimmer ─────────────────────────────────────────────────

function RowShimmer() {
  return (
    <div className="flex items-start gap-3 px-4 py-4 animate-pulse">
      <div className="h-11 w-11 shrink-0 rounded-xl bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-4 w-20 rounded-full bg-muted" />
          <div className="h-4 w-28 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

// ── Filter drawer ───────────────────────────────────────────────

function FilterDrawer({
  open,
  onClose,
  shops,
  shopId,
  onShopChange,
  from,
  onFromChange,
  to,
  onToChange,
  severity,
  onSeverityChange,
  action,
  onActionChange,
  userId,
  onUserIdChange,
  users,
  actions,
  activeFilterCount,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  shops: ShopOption[];
  shopId: string;
  onShopChange: (value: string) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  severity: SeverityFilter;
  onSeverityChange: (value: SeverityFilter) => void;
  action: string;
  onActionChange: (value: string) => void;
  userId: string;
  onUserIdChange: (value: string) => void;
  users: Array<{ userId: string | null; userName: string | null }>;
  actions: string[];
  activeFilterCount: number;
  onClear: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-filter-title"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-[0_30px_60px_rgba(15,23,42,0.25)] sm:rounded-3xl"
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-muted-foreground/30 sm:hidden" />
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h3
              id="audit-filter-title"
              className="text-base font-bold text-foreground"
            >
              ফিল্টার
            </h3>
            {activeFilterCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {toBn(activeFilterCount)}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Shop */}
          {shops.length > 1 ? (
            <Field label="দোকান">
              <select
                value={shopId}
                onChange={(e) => onShopChange(e.target.value)}
                className={selectClass}
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {/* Date range */}
          <Field label="সময়সীমা">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
                className={selectClass}
              />
              <input
                type="date"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                className={selectClass}
              />
            </div>
          </Field>

          {/* Severity chips */}
          <Field label="Severity">
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((option) => {
                const isActive = severity === option.value;
                return (
                  <button
                    key={option.value || "all"}
                    type="button"
                    onClick={() => onSeverityChange(option.value)}
                    className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-semibold transition ${
                      isActive
                        ? "border-primary/40 bg-primary-soft text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Action */}
          <Field label="ধরন (action)">
            <select
              value={action}
              onChange={(e) => onActionChange(e.target.value)}
              className={selectClass}
            >
              <option value="">সব ধরন</option>
              {actions.map((value) => (
                <option key={value} value={value}>
                  {getAuditActionLabel(value)}
                </option>
              ))}
            </select>
          </Field>

          {/* User */}
          <Field label="ব্যবহারকারী">
            <select
              value={userId}
              onChange={(e) => onUserIdChange(e.target.value)}
              className={selectClass}
            >
              <option value="">সবাই</option>
              {users
                .filter((u) => u.userId)
                .map((u) => (
                  <option key={u.userId!} value={u.userId!}>
                    {u.userName || u.userId}
                  </option>
                ))}
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 p-3 sm:p-4">
          <button
            type="button"
            onClick={onClear}
            disabled={activeFilterCount === 0}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            সব মুছে দিন
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            প্রয়োগ করুন
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const selectClass =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20";
