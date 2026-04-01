import { businessOptions } from "@/lib/productFormConfig";
import type { BillingStatus } from "@/lib/billing";
import type { TodaySummary } from "@/lib/reports/today-summary";

export type OwnerCopilotBaseline = {
  sales: number;
  profit: number;
  expenses: number;
  cashBalance: number;
};

export type OwnerCopilotSnapshot = {
  businessType: string | null;
  shopName: string;
  businessLabel: string;
  topProductName: string | null;
  topProductQty: number;
  topProductRevenue: number;
  lowStockCount: number;
  lowestStockName: string | null;
  lowestStockQty: number | null;
  dueTotal: number;
  dueCustomerCount: number;
  topDueCustomerName: string | null;
  topDueCustomerAmount: number;
  payablesTotal: number;
  payableCount: number;
  payableSupplierCount: number;
  queuePendingCount: number;
  billingStatus: BillingStatus;
  yesterday: OwnerCopilotBaseline;
  average7d: OwnerCopilotBaseline;
  topExpenseCategoryName: string | null;
  topExpenseCategoryAmount: number;
};

export type OwnerCopilotAction = {
  label: string;
  href: string;
};

export type OwnerCopilotMetric = {
  label: string;
  value: string;
  trendLabel: string;
  tone: "success" | "warning" | "danger" | "muted";
};

type OwnerCopilotMetricTone = OwnerCopilotMetric["tone"];

export type OwnerCopilotInsight = {
  tone: "success" | "warning" | "danger" | "primary";
  badge: string;
  headline: string;
  overview: string;
  priorityLabel: string;
  metrics: OwnerCopilotMetric[];
  bullets: string[];
  actionNotes: string[];
  actions: OwnerCopilotAction[];
};

function roundMoney(value?: number | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

function formatMoney(value?: number | null) {
  return `৳ ${roundMoney(value).toFixed(2)}`;
}

function percentDelta(current: number, base: number) {
  const currentValue = roundMoney(current);
  const baseValue = roundMoney(base);
  if (Math.abs(baseValue) < 0.01) {
    if (Math.abs(currentValue) < 0.01) return 0;
    return null;
  }
  return Number((((currentValue - baseValue) / Math.abs(baseValue)) * 100).toFixed(1));
}

function directionLabel(
  current: number,
  base: number,
  options?: { higherIsBetter?: boolean; idleLabel?: string }
): { label: string; tone: OwnerCopilotMetricTone } {
  const higherIsBetter = options?.higherIsBetter ?? true;
  const idleLabel = options?.idleLabel ?? "গতকালের সমান";
  const delta = percentDelta(current, base);
  if (delta === null) {
    if (Math.abs(current) < 0.01) return { label: idleLabel, tone: "muted" as const };
    return {
      label: `নতুন ${current > 0 ? "চলাচল" : "পরিবর্তন"}`,
      tone: higherIsBetter ? "success" : "warning",
    };
  }
  if (Math.abs(delta) < 0.5) {
    return { label: idleLabel, tone: "muted" as const };
  }
  const positive = delta > 0;
  const tone: OwnerCopilotMetricTone =
    positive === higherIsBetter
      ? "success"
      : higherIsBetter
        ? "danger"
        : "warning";
  return {
    label: `গতকালের তুলনায় ${Math.abs(delta).toFixed(1)}% ${positive ? "বেশি" : "কম"}`,
    tone,
  };
}

function avgLabel(current: number, average: number, noun = "৭ দিনের গড়") {
  const delta = percentDelta(current, average);
  if (delta === null || Math.abs(delta) < 0.5) return `${noun}-এর কাছাকাছি`;
  return `${noun}-এর তুলনায় ${Math.abs(delta).toFixed(1)}% ${delta > 0 ? "বেশি" : "কম"}`;
}

export function getBusinessTypeLabel(value?: string | null) {
  const key = String(value || "").trim().toLowerCase();
  return (
    businessOptions.find((item) => item.id === key)?.label ||
    (key ? key.replace(/_/g, " ") : "দোকান")
  );
}

function isRetailHeavyType(businessType: string) {
  return [
    "mini_grocery",
    "mini_wholesale",
    "pharmacy",
    "clothing",
    "cosmetics_gift",
    "snacks_stationery",
    "fruits_veg",
  ].includes(businessType);
}

function isFoodType(businessType: string) {
  return ["tea_stall", "fruits_veg", "snacks_stationery"].includes(businessType);
}

function isServiceType(businessType: string) {
  return ["mobile_recharge"].includes(businessType);
}

function buildMetricRows(summary: TodaySummary, snapshot: OwnerCopilotSnapshot) {
  const todayExpense = roundMoney(summary.expenses.total + (summary.expenses.cogs ?? 0));
  const salesTrend = directionLabel(summary.sales.total, snapshot.yesterday.sales, {
    higherIsBetter: true,
  });
  const profitTrend = directionLabel(summary.profit, snapshot.yesterday.profit, {
    higherIsBetter: true,
  });
  const expenseTrend = directionLabel(todayExpense, snapshot.yesterday.expenses, {
    higherIsBetter: false,
  });
  const cashTrend = directionLabel(summary.cash.balance, snapshot.yesterday.cashBalance, {
    higherIsBetter: true,
  });
  const metrics: OwnerCopilotMetric[] = [
    {
      label: "বিক্রি",
      value: formatMoney(summary.sales.total),
      trendLabel: salesTrend.label,
      tone: salesTrend.tone,
    },
    {
      label: "লাভ",
      value: formatMoney(summary.profit),
      trendLabel: profitTrend.label,
      tone: profitTrend.tone,
    },
    {
      label: "খরচ",
      value: formatMoney(todayExpense),
      trendLabel: expenseTrend.label,
      tone: expenseTrend.tone,
    },
    {
      label: "ক্যাশ",
      value: formatMoney(summary.cash.balance),
      trendLabel: cashTrend.label,
      tone: cashTrend.tone,
    },
  ];

  return metrics;
}

function buildCommonBullets(summary: TodaySummary, snapshot: OwnerCopilotSnapshot) {
  const bullets: string[] = [];

  if (snapshot.topProductName) {
    bullets.push(
      `আজ সবচেয়ে টানছে ${snapshot.topProductName}; বিক্রি ${snapshot.topProductQty.toFixed(
        snapshot.topProductQty % 1 === 0 ? 0 : 2
      )} ইউনিট এবং revenue ${formatMoney(snapshot.topProductRevenue)}।`
    );
  } else if (summary.sales.count > 0) {
    bullets.push(`আজ মোট ${summary.sales.count}টি বিক্রি হয়েছে।`);
  } else {
    bullets.push("আজ এখনো কোনো বিক্রি রেকর্ড হয়নি।");
  }

  if (snapshot.dueTotal > 0) {
    bullets.push(
      `${snapshot.dueCustomerCount} জন কাস্টমারের কাছে মোট বাকি ${formatMoney(snapshot.dueTotal)}।`
    );
  }

  if (snapshot.lowStockCount > 0) {
    bullets.push(
      snapshot.lowestStockName && snapshot.lowestStockQty !== null
        ? `${snapshot.lowStockCount}টি পণ্য low stock; সবচেয়ে নিচে ${snapshot.lowestStockName} (${snapshot.lowestStockQty.toFixed(
            snapshot.lowestStockQty % 1 === 0 ? 0 : 2
          )})`
        : `${snapshot.lowStockCount}টি tracked item low stock-এ আছে।`
    );
  }

  return bullets;
}

export function buildOwnerCopilotInsight(
  shopId: string,
  summary: TodaySummary,
  snapshot: OwnerCopilotSnapshot
): OwnerCopilotInsight {
  const businessType = String(snapshot.businessType || "").trim().toLowerCase();
  const sales = roundMoney(summary.sales.total);
  const expenses = roundMoney(summary.expenses.total + (summary.expenses.cogs ?? 0));
  const profit = roundMoney(summary.profit);
  const metrics = buildMetricRows(summary, snapshot);
  const actions: OwnerCopilotAction[] = [];
  const bullets = buildCommonBullets(summary, snapshot);
  const actionNotes: string[] = [];

  const salesVsYesterday = percentDelta(sales, snapshot.yesterday.sales);
  const profitVsYesterday = percentDelta(profit, snapshot.yesterday.profit);
  const profitVsAverage = percentDelta(profit, snapshot.average7d.profit);
  const expenseVsAverage = percentDelta(expenses, snapshot.average7d.expenses);
  const duePressureHigh = snapshot.dueTotal >= Math.max(1500, sales * 0.25);
  const lowStockRisk = snapshot.lowStockCount >= (isRetailHeavyType(businessType) ? 2 : 3);
  const expenseSpike = expenseVsAverage !== null && expenseVsAverage >= 18;
  const queuePressure = snapshot.queuePendingCount >= 4;

  const addAction = (label: string, href: string) => {
    if (!actions.some((item) => item.href === href)) {
      actions.push({ label, href });
    }
  };

  const addActionNote = (note: string) => {
    if (!actionNotes.includes(note)) {
      actionNotes.push(note);
    }
  };

  addAction("বিক্রি দেখুন", `/dashboard/sales?shopId=${shopId}`);
  addAction("রিপোর্ট দেখুন", `/dashboard/reports?shopId=${shopId}`);

  if (snapshot.dueTotal > 0) addAction("বাকি তুলুন", `/dashboard/due?shopId=${shopId}`);
  if (snapshot.lowStockCount > 0) addAction("স্টক দেখুন", `/dashboard/products?shopId=${shopId}`);
  if (snapshot.payablesTotal > 0) addAction("ক্রয় দেখুন", `/dashboard/purchases?shopId=${shopId}`);
  if (snapshot.queuePendingCount > 0) addAction("কিউ দেখুন", `/dashboard/queue?shopId=${shopId}`);

  if (snapshot.billingStatus === "past_due" || snapshot.billingStatus === "due") {
    bullets.push("সাবস্ক্রিপশন invoice খোলা আছে; এটা clear করলে uninterrupted flow থাকবে।");
  }

  if (snapshot.payablesTotal > 0 && (isRetailHeavyType(businessType) || businessType === "mini_wholesale")) {
    bullets.push(
      `${snapshot.payableSupplierCount} জন supplier-এর কাছে payable ${formatMoney(
        snapshot.payablesTotal
      )}; purchase planning tight রাখা দরকার।`
    );
  }

  if (snapshot.topExpenseCategoryName && snapshot.topExpenseCategoryAmount > 0) {
    bullets.push(
      `আজ সবচেয়ে বেশি খরচ গেছে ${snapshot.topExpenseCategoryName} category-তে (${formatMoney(
        snapshot.topExpenseCategoryAmount
      )})।`
    );
  }

  if (snapshot.queuePendingCount > 0) {
    bullets.push(`এখন queue-তে ${snapshot.queuePendingCount}টি token pending আছে।`);
  }

  if (lowStockRisk) {
    addActionNote(
      snapshot.lowestStockName
        ? `${snapshot.lowestStockName} সহ fast-moving low stock item restock করুন।`
        : "Fast-moving low stock item restock করুন।"
    );
  }

  if (duePressureHigh) {
    addActionNote(
      snapshot.topDueCustomerName
        ? `${snapshot.topDueCustomerName}-সহ বড় due customer-দের follow-up করুন।`
        : "আজ due collection-এ focus দিন, cash flow stronger হবে।"
    );
  }

  if (expenseSpike) {
    addActionNote(
      snapshot.topExpenseCategoryName
        ? `${snapshot.topExpenseCategoryName} category-র খরচ review করুন; আজ এটা ৭ দিনের গড়ের চেয়ে বেশি।`
        : "আজকের খরচ ৭ দিনের গড়ের চেয়ে বেশি; expense entry review করুন।"
    );
  }

  if (sales <= 0) {
    addActionNote("Top item সামনে রাখুন বা quick offer/push দিয়ে আজ sale trigger করুন।");
  } else if (snapshot.topProductName) {
    addActionNote(`${snapshot.topProductName} সামনে push করুন; আজ এই item momentum দিচ্ছে।`);
  }

  if (queuePressure && (isFoodType(businessType) || businessType.includes("salon"))) {
    addActionNote("Queue দ্রুত clear করুন; service speed বাড়লে আরও sale ধরতে পারবেন।");
  }

  let tone: OwnerCopilotInsight["tone"] = "success";
  let badge = isServiceType(businessType) ? "আজ steady চলছে" : "আজ ভালো চলছে";
  let headline =
    sales > 0
      ? `আজ ${snapshot.shopName} steady flow-এ আছে।`
      : "দোকান প্রস্তুত আছে, এখন sale trigger দরকার।";
  let overview =
    sales > 0
      ? `আজকের বিক্রি ${formatMoney(sales)}। ${avgLabel(
          profit,
          snapshot.average7d.profit,
          "গত ৭ দিনের লাভের গড়"
        )}.`
      : "আজকের flow monitor করুন, especially sale trigger, due collection, আর expense control.";
  let priorityLabel = "Healthy day";

  if (profitVsYesterday !== null && profitVsYesterday <= -8) {
    tone = "warning";
    badge = "Profit down";
    headline = `আজ লাভ গতকালের তুলনায় ${Math.abs(profitVsYesterday).toFixed(1)}% কম।`;
    overview = expenseSpike
      ? `মূল চাপ এসেছে খরচের দিক থেকে। ${avgLabel(
          expenses,
          snapshot.average7d.expenses,
          "খরচের ৭ দিনের গড়"
        )}.`
      : duePressureHigh
        ? "Profit paper-এ আছে, কিন্তু due pressure cash flow slow করছে।"
        : lowStockRisk
          ? "Low stock আর missed-sale risk মার্জিনে চাপ ফেলছে।"
          : `${avgLabel(
              profit,
              snapshot.average7d.profit,
              "লাভের ৭ দিনের গড়"
            )}; detail review দরকার।`;
    priorityLabel = "Recover margin";
  } else if (profitVsYesterday !== null && profitVsYesterday >= 8) {
    tone = "success";
    badge = "Profit up";
    headline = `আজ লাভ গতকালের তুলনায় ${Math.abs(profitVsYesterday).toFixed(1)}% বেশি।`;
    overview = snapshot.topProductName
      ? `${snapshot.topProductName} আজ growth driver. ${avgLabel(
          sales,
          snapshot.average7d.sales,
          "বিক্রির ৭ দিনের গড়"
        )}.`
      : `${avgLabel(sales, snapshot.average7d.sales, "বিক্রির ৭ দিনের গড়")}। এই momentum ধরে রাখুন।`;
    priorityLabel = "Scale today";
  } else if (duePressureHigh) {
    tone = "warning";
    badge = "বাকি চাপ";
    headline = "আজ due collection-এ focus দিলে cash flow noticeably ভালো হবে।";
    overview =
      snapshot.topDueCustomerName && snapshot.topDueCustomerAmount > 0
        ? `${snapshot.topDueCustomerName}-এর কাছেই সবচেয়ে বেশি বাকি: ${formatMoney(
            snapshot.topDueCustomerAmount
          )}.`
        : `মোট due এখন ${formatMoney(snapshot.dueTotal)}।`;
    priorityLabel = "Collect due";
  } else if (lowStockRisk) {
    tone = "danger";
    badge = "Restock focus";
    headline = "স্টক ফুরানোর আগে reorder plan করলে sale miss কমবে।";
    overview = snapshot.lowestStockName
      ? `${snapshot.lowestStockName} এখন সবচেয়ে নিচের দিকে। ${
          snapshot.topProductName === snapshot.lowestStockName
            ? "এটাই top mover, তাই restock urgent।"
            : "Tracked item flow এখন tight।"
        }`
      : "Tracked inventory-তে pressure জমছে।";
    priorityLabel = "Restock now";
  } else if (queuePressure && (isFoodType(businessType) || businessType.includes("salon"))) {
    tone = "primary";
    badge = "Service flow";
    headline = "Queue speed বাড়ালে একই সময়ে আরও revenue তোলা যাবে।";
    overview = `এখন ${snapshot.queuePendingCount}টি pending token আছে। Service turnaround tighten করলে লাভ বাড়বে।`;
    priorityLabel = "Queue active";
  } else if (salesVsYesterday !== null && salesVsYesterday <= -10) {
    tone = "warning";
    badge = "Sales down";
    headline = `আজ বিক্রি গতকালের তুলনায় ${Math.abs(salesVsYesterday).toFixed(1)}% কম।`;
    overview = snapshot.topProductName
      ? `${snapshot.topProductName} সামনে push করুন এবং quick seller-এ focus দিন।`
      : "Top-selling line-up সামনে আনলে sale recovery faster হবে।";
    priorityLabel = "Boost sales";
  }

  return {
    tone,
    badge,
    headline,
    overview,
    priorityLabel,
    metrics,
    bullets: bullets.slice(0, 3),
    actionNotes: actionNotes.slice(0, 3),
    actions: actions.slice(0, 3),
  };
}
