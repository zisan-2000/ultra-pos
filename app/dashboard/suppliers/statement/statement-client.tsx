// app/dashboard/suppliers/statement/statement-client.tsx

"use client";

type SupplierOption = { id: string; name: string };
type StatementData = {
  supplier: { id: string; name: string; phone?: string | null; address?: string | null };
  totals: { purchaseTotal: number; paymentTotal: number; balance: number };
  ageing: Record<string, { amount: number; percent: number }>;
  ledger: { id: string; entryType: string; amount: string; note?: string | null; entryDate: string }[];
  ledgerMeta?: { page: number; pageSize: number; total: number; totalPages: number };
} | null;

type Props = {
  shopId: string;
  suppliers: SupplierOption[];
  supplierId: string;
  from: string;
  to: string;
  statement: StatementData;
  canCreatePurchase: boolean;
  canCreatePurchasePayment: boolean;
};

function fmt(n: number) {
  return n.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ENTRY_META: Record<string, { label: string; icon: string; color: string; amountColor: string }> = {
  PURCHASE: { label: "ক্রয়", icon: "📦", color: "border-warning/30 bg-warning-soft/50 text-warning", amountColor: "text-warning" },
  PAYMENT:  { label: "পরিশোধ", icon: "💳", color: "border-success/30 bg-success-soft/50 text-success", amountColor: "text-success" },
  RETURN:   { label: "রিটার্ন", icon: "🔄", color: "border-primary/30 bg-primary-soft/50 text-primary", amountColor: "text-primary" },
};

export default function SupplierStatementClient({
  shopId,
  suppliers,
  supplierId,
  from,
  to,
  statement,
  canCreatePurchase,
  canCreatePurchasePayment,
}: Props) {
  const supplierInitial = statement?.supplier.name?.trim().charAt(0).toUpperCase() ?? "?";
  const balance = statement?.totals.balance ?? 0;

  return (
    <div className="space-y-4">

      {/* ── Filter form ── */}
      <form
        method="get"
        action="/dashboard/suppliers/statement"
        className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          ফিল্টার করুন
        </p>
        <input type="hidden" name="shopId" value={shopId} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">সরবরাহকারী</label>
            <select
              name="supplierId"
              defaultValue={supplierId}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">শুরু তারিখ</label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">শেষ তারিখ</label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <button
          type="submit"
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary-hover transition-colors"
        >
          স্টেটমেন্ট দেখুন
        </button>
      </form>

      {statement ? (
        <>
          {/* ── Supplier summary card ── */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-muted/30 via-card to-card" />
            <div className="relative p-4 space-y-4">

              {/* Supplier identity */}
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/20 text-lg font-bold shadow-sm">
                  {supplierInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-foreground leading-tight">{statement.supplier.name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {statement.supplier.phone ? (
                      <span>{statement.supplier.phone}</span>
                    ) : (
                      <span className="italic">ফোন নেই</span>
                    )}
                    {statement.supplier.address ? (
                      <> · {statement.supplier.address}</>
                    ) : null}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">মোট বাকি</p>
                  <p className={`text-xl font-extrabold tabular-nums ${balance > 0 ? "text-danger" : "text-success"}`}>
                    ৳ {fmt(balance)}
                  </p>
                  {balance === 0 ? (
                    <span className="text-[10px] font-semibold text-success">পরিশোধিত ✓</span>
                  ) : null}
                </div>
              </div>

              {/* Financial chips */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">মোট ক্রয়</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">৳ {fmt(statement.totals.purchaseTotal)}</p>
                </div>
                <div className="rounded-xl border border-success/20 bg-success-soft/30 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-success/70">পরিশোধ</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-success">৳ {fmt(statement.totals.paymentTotal)}</p>
                </div>
                <div className={`rounded-xl px-3 py-2.5 text-center ${
                  balance > 0
                    ? "border border-danger/20 bg-danger-soft/30"
                    : "border border-success/20 bg-success-soft/30"
                }`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-widest ${balance > 0 ? "text-danger/70" : "text-success/70"}`}>বাকি</p>
                  <p className={`mt-0.5 text-sm font-bold tabular-nums ${balance > 0 ? "text-danger" : "text-success"}`}>
                    ৳ {fmt(balance)}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                {canCreatePurchasePayment && balance > 0 ? (
                  <a
                    href={`/dashboard/purchases/pay?shopId=${shopId}&supplierId=${supplierId}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-4 text-sm font-semibold text-warning hover:bg-warning/15 transition-colors"
                  >
                    💳 বাকি পরিশোধ
                  </a>
                ) : null}
                {canCreatePurchase ? (
                  <a
                    href={`/dashboard/purchases/new?shopId=${shopId}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    📦 নতুন ক্রয়
                  </a>
                ) : null}
                <a
                  href={`/dashboard/purchases?shopId=${shopId}&supplierId=${supplierId}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  ক্রয় তালিকা →
                </a>
              </div>
            </div>
          </div>

          {/* ── Ageing analysis ── */}
          {Object.keys(statement.ageing).length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
                বকেয়া বয়স বিশ্লেষণ
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Object.entries(statement.ageing).map(([label, value]) => {
                  const hasAmount = value.amount > 0;
                  return (
                    <div
                      key={label}
                      className={`rounded-xl border px-3 py-2.5 text-center ${
                        hasAmount
                          ? "border-danger/25 bg-danger-soft/40"
                          : "border-border bg-muted/20"
                      }`}
                    >
                      <p className={`text-[10px] font-semibold uppercase tracking-widest ${hasAmount ? "text-danger/70" : "text-muted-foreground"}`}>
                        {label} দিন
                      </p>
                      <p className={`mt-0.5 text-sm font-bold tabular-nums ${hasAmount ? "text-danger" : "text-muted-foreground"}`}>
                        ৳ {fmt(value.amount)}
                      </p>
                      <p className={`text-[10px] font-semibold ${hasAmount ? "text-danger/60" : "text-muted-foreground/60"}`}>
                        {value.percent}%
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ── Ledger ── */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-border/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                লেনদেন ইতিহাস
              </p>
              {statement.ledgerMeta ? (
                <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  মোট {statement.ledgerMeta.total} টি
                </span>
              ) : null}
            </div>

            {statement.ledger.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">এই সময়ের মধ্যে কোনো লেনদেন নেই।</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {statement.ledger.map((row) => {
                  const meta = ENTRY_META[row.entryType] ?? {
                    label: row.entryType,
                    icon: "📋",
                    color: "border-border bg-muted/40 text-muted-foreground",
                    amountColor: "text-foreground",
                  };
                  return (
                    <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-base">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.color}`}>
                            {meta.label}
                          </span>
                          {row.note ? (
                            <span className="text-xs text-muted-foreground truncate">{row.note}</span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {new Date(row.entryDate).toLocaleDateString("bn-BD", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <p className={`text-sm font-bold tabular-nums shrink-0 ${meta.amountColor}`}>
                        ৳ {fmt(Number(row.amount))}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {statement.ledgerMeta && statement.ledgerMeta.totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-border/40 px-4 py-3">
                <a
                  href={`/dashboard/suppliers/statement?shopId=${shopId}&supplierId=${supplierId}&from=${from}&to=${to}&page=${Math.max(1, statement.ledgerMeta.page - 1)}`}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
                    statement.ledgerMeta.page <= 1
                      ? "border-border/40 text-muted-foreground/40 pointer-events-none"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  ← আগে
                </a>
                <span className="text-xs text-muted-foreground font-semibold">
                  পৃষ্ঠা {statement.ledgerMeta.page} / {statement.ledgerMeta.totalPages}
                </span>
                <a
                  href={`/dashboard/suppliers/statement?shopId=${shopId}&supplierId=${supplierId}&from=${from}&to=${to}&page=${Math.min(statement.ledgerMeta.totalPages, statement.ledgerMeta.page + 1)}`}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
                    statement.ledgerMeta.page >= statement.ledgerMeta.totalPages
                      ? "border-border/40 text-muted-foreground/40 pointer-events-none"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  পরে →
                </a>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        /* ── Empty state ── */
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground text-xl">
            📊
          </div>
          <p className="text-sm font-semibold text-muted-foreground">সরবরাহকারী নির্বাচন করুন</p>
          <p className="text-xs text-muted-foreground">উপরের ফিল্টারে সরবরাহকারী বেছে "স্টেটমেন্ট দেখুন" চাপুন</p>
          <a
            href={`/dashboard/suppliers?shopId=${shopId}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            সরবরাহকারী তালিকা →
          </a>
        </div>
      )}
    </div>
  );
}
