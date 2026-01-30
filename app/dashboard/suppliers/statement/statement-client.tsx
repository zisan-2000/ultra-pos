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
};

export default function SupplierStatementClient({
  shopId,
  suppliers,
  supplierId,
  from,
  to,
  statement,
}: Props) {
  return (
    <div className="space-y-4">
      <form
        method="get"
        action="/dashboard/suppliers/statement"
        className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] space-y-3"
      >
        <input type="hidden" name="shopId" value={shopId} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              সরবরাহকারী
            </label>
            <select
              name="supplierId"
              defaultValue={supplierId}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              শুরু তারিখ
            </label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              শেষ তারিখ
            </label>
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
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg hover:bg-primary-hover"
        >
          স্টেটমেন্ট দেখুন
        </button>
      </form>

      {statement ? (
        <>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">{statement.supplier.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {statement.supplier.phone || "ফোন নেই"} · {statement.supplier.address || "ঠিকানা নেই"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">বর্তমান বাকি</p>
                <p className="text-lg font-bold text-danger">
                  ৳ {statement.totals.balance.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                <p className="text-muted-foreground">মোট ক্রয়</p>
                <p className="font-semibold text-foreground">
                  ৳ {statement.totals.purchaseTotal.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                <p className="text-muted-foreground">পরিশোধ</p>
                <p className="font-semibold text-foreground">
                  ৳ {statement.totals.paymentTotal.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                <p className="text-muted-foreground">বাকি</p>
                <p className="font-semibold text-foreground">
                  ৳ {statement.totals.balance.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/dashboard/purchases/pay?shopId=${shopId}&supplierId=${supplierId}`}
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors"
              >
                বাকি পরিশোধ
              </a>
              <a
                href={`/dashboard/purchases/new?shopId=${shopId}`}
                className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
              >
                নতুন ক্রয়
              </a>
              <a
                href={`/dashboard/purchases?shopId=${shopId}`}
                className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
              >
                ক্রয় তালিকা
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <h3 className="text-base font-semibold text-foreground">বকেয়া বয়স (Ageing)</h3>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {Object.entries(statement.ageing).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                  <p className="text-muted-foreground">{label} দিন</p>
                  <p className="font-semibold text-foreground">৳ {Number(value.amount).toFixed(2)}</p>
                  <p className="text-[11px] text-muted-foreground">{value.percent}%</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <h3 className="text-base font-semibold text-foreground">লেনদেন ইতিহাস</h3>
            <div className="mt-3 space-y-2">
              {statement.ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো লেনদেন নেই।</p>
              ) : (
                statement.ledger.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {row.entryType === "PURCHASE" ? "ক্রয়" : "পরিশোধ"}
                      </p>
                      <p className="text-muted-foreground">
                        {row.note || "নোট নেই"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">৳ {Number(row.amount).toFixed(2)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(row.entryDate).toLocaleDateString("bn-BD")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {statement.ledgerMeta && statement.ledgerMeta.totalPages > 1 ? (
              <div className="mt-3 flex items-center justify-between text-xs">
                <a
                  href={`/dashboard/suppliers/statement?shopId=${shopId}&supplierId=${supplierId}&from=${from}&to=${to}&page=${Math.max(
                    1,
                    statement.ledgerMeta.page - 1
                  )}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold ${
                    statement.ledgerMeta.page <= 1
                      ? "border-border/50 text-muted-foreground pointer-events-none"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  Prev
                </a>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
                  Page {statement.ledgerMeta.page} / {statement.ledgerMeta.totalPages}
                </span>
                <a
                  href={`/dashboard/suppliers/statement?shopId=${shopId}&supplierId=${supplierId}&from=${from}&to=${to}&page=${Math.min(
                    statement.ledgerMeta.totalPages,
                    statement.ledgerMeta.page + 1
                  )}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold ${
                    statement.ledgerMeta.page >= statement.ledgerMeta.totalPages
                      ? "border-border/50 text-muted-foreground pointer-events-none"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  Next
                </a>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground space-y-3">
          <p>সরবরাহকারী নির্বাচন করুন।</p>
          <a
            href={`/dashboard/suppliers?shopId=${shopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            সরবরাহকারী তালিকা
          </a>
        </div>
      )}
    </div>
  );
}
