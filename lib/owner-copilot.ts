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

export type OwnerCopilotPlaybookItem = {
  id: string;
  tone: "success" | "warning" | "danger" | "primary";
  title: string;
  reason: string;
  action: string;
  impactLabel: string;
  confidenceLabel: "ভরসা বেশি" | "ভরসা মাঝারি" | "ভরসা কম";
  guardrail: string;
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
  playbook: OwnerCopilotPlaybookItem[];
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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getBlendedMarginRate(summary: TodaySummary, snapshot: OwnerCopilotSnapshot) {
  const directSales = roundMoney(summary.sales.total);
  if (directSales > 0) {
    return clampNumber(roundMoney(summary.profit) / directSales, 0.06, 0.6);
  }
  if (snapshot.average7d.sales > 0) {
    return clampNumber(snapshot.average7d.profit / snapshot.average7d.sales, 0.06, 0.6);
  }
  return 0.14;
}

function formatImpactLabel(
  amount: number,
  options?: { type?: "profit" | "cash"; fallback?: string }
) {
  const rounded = roundMoney(amount);
  if (rounded < 1) {
    return options?.fallback ?? "আজ লাভ ধরে রাখার দিকে ফোকাস দিন";
  }
  if (options?.type === "cash") {
    return `হাতে নগদ প্রায় ${formatMoney(rounded)} আসতে পারে`;
  }
  return `লাভ প্রায় ${formatMoney(rounded)} বাড়তে পারে`;
}

function getTopSellerAction(businessType: string, productName: string) {
  if (businessType.includes("restaurant") || businessType === "tea_stall") {
    return `${productName} মেনুর উপরে রাখুন, কাউন্টার থেকে আগে বলুন, আর কম্বো দিয়ে বিক্রি বাড়ান।`;
  }
  if (businessType === "mobile_recharge") {
    return `${productName} চোখে পড়ার মতো জায়গায় রাখুন এবং quick তালিকায় উপরে দিন।`;
  }
  return `${productName} সামনে রাখুন, দ্রুত বিক্রিতে দিন, আর স্টাফকে আগে এটা অফার করতে বলুন।`;
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
      `আজ সবচেয়ে বেশি বিক্রি হয়েছে ${snapshot.topProductName}। বিক্রি ${snapshot.topProductQty.toFixed(
        snapshot.topProductQty % 1 === 0 ? 0 : 2
      )} ইউনিট, মোট বিক্রি ${formatMoney(snapshot.topProductRevenue)}।`
    );
  } else if (summary.sales.count > 0) {
    bullets.push(`আজ মোট ${summary.sales.count}টি বিক্রি হয়েছে।`);
  } else {
    bullets.push("আজ এখনো কোনো বিক্রি হয়নি।");
  }

  if (snapshot.dueTotal > 0) {
    bullets.push(
      `${snapshot.dueCustomerCount} জন কাস্টমারের কাছে মোট বাকি আছে ${formatMoney(snapshot.dueTotal)}।`
    );
  }

  if (snapshot.lowStockCount > 0) {
    bullets.push(
      snapshot.lowestStockName && snapshot.lowestStockQty !== null
        ? `${snapshot.lowStockCount}টি পণ্যের স্টক কম। সবচেয়ে কম আছে ${snapshot.lowestStockName} (${snapshot.lowestStockQty.toFixed(
            snapshot.lowestStockQty % 1 === 0 ? 0 : 2
          )})`
        : `${snapshot.lowStockCount}টি পণ্যের স্টক এখন কম।`
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
  const playbookCandidates: Array<OwnerCopilotPlaybookItem & { score: number }> = [];

  const salesVsYesterday = percentDelta(sales, snapshot.yesterday.sales);
  const profitVsYesterday = percentDelta(profit, snapshot.yesterday.profit);
  const expenseVsAverage = percentDelta(expenses, snapshot.average7d.expenses);
  const salesVsAverage = percentDelta(sales, snapshot.average7d.sales);
  const duePressureHigh = snapshot.dueTotal >= Math.max(1500, sales * 0.25);
  const lowStockRisk = snapshot.lowStockCount >= (isRetailHeavyType(businessType) ? 2 : 3);
  const expenseSpike = expenseVsAverage !== null && expenseVsAverage >= 18;
  const queuePressure = snapshot.queuePendingCount >= 4;
  const blendedMarginRate = getBlendedMarginRate(summary, snapshot);
  const averageTicket =
    summary.sales.count > 0 ? roundMoney(summary.sales.total / summary.sales.count) : 0;
  const topProductShare = sales > 0 ? snapshot.topProductRevenue / sales : 0;
  const topProductIsStockRisk =
    Boolean(snapshot.topProductName) &&
    Boolean(snapshot.lowestStockName) &&
    snapshot.topProductName === snapshot.lowestStockName;
  const excessExpense = Math.max(0, expenses - snapshot.average7d.expenses);

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

  const addPlaybook = (
    item: OwnerCopilotPlaybookItem,
    score: number
  ) => {
    if (!playbookCandidates.some((candidate) => candidate.id === item.id)) {
      playbookCandidates.push({ ...item, score });
    }
  };

  addAction("বিক্রি দেখুন", `/dashboard/sales?shopId=${shopId}`);
  addAction("রিপোর্ট দেখুন", `/dashboard/reports?shopId=${shopId}`);

  if (snapshot.dueTotal > 0) addAction("বাকি তুলুন", `/dashboard/due?shopId=${shopId}`);
  if (snapshot.lowStockCount > 0) addAction("স্টক দেখুন", `/dashboard/products?shopId=${shopId}`);
  if (snapshot.payablesTotal > 0) addAction("ক্রয় দেখুন", `/dashboard/purchases?shopId=${shopId}`);
  if (snapshot.queuePendingCount > 0) addAction("কিউ দেখুন", `/dashboard/queue?shopId=${shopId}`);

  if (snapshot.billingStatus === "past_due" || snapshot.billingStatus === "due") {
    bullets.push("সাবস্ক্রিপশনের বিল বাকি আছে; পরিশোধ করলে সেবা বন্ধ হবে না।");
  }

  if (snapshot.payablesTotal > 0 && (isRetailHeavyType(businessType) || businessType === "mini_wholesale")) {
    bullets.push(
      `${snapshot.payableSupplierCount} জন সাপ্লায়ারের কাছে বাকি আছে ${formatMoney(
        snapshot.payablesTotal
      )}; তাই কেনাকাটার পরিকল্পনা করে চলা দরকার।`
    );
  }

  if (snapshot.topExpenseCategoryName && snapshot.topExpenseCategoryAmount > 0) {
    bullets.push(
      `আজ সবচেয়ে বেশি খরচ হয়েছে ${snapshot.topExpenseCategoryName} খাতে (${formatMoney(
        snapshot.topExpenseCategoryAmount
      )})।`
    );
  }

  if (snapshot.queuePendingCount > 0) {
    bullets.push(`এখন কিউতে ${snapshot.queuePendingCount}টি টোকেন অপেক্ষায় আছে।`);
  }

  if (snapshot.topProductName && snapshot.topProductRevenue > 0) {
    const pushImpact = Math.max(
      20,
      roundMoney(snapshot.topProductRevenue * 0.12 * blendedMarginRate)
    );
    addPlaybook(
      {
        id: "top-seller-push",
        tone:
          salesVsYesterday !== null && salesVsYesterday <= -10 ? "warning" : "success",
        title: `${snapshot.topProductName} আজ বেশি বিক্রি হচ্ছে`,
        reason: `${snapshot.topProductName} আজ ${snapshot.topProductQty.toFixed(
          snapshot.topProductQty % 1 === 0 ? 0 : 2
        )} ইউনিট বিক্রি হয়ে ${formatMoney(snapshot.topProductRevenue)} বিক্রি এসেছে${
          topProductShare >= 0.25
            ? `, যা মোট বিক্রির ${(topProductShare * 100).toFixed(1)}%।`
            : "।"
        }`,
        action: getTopSellerAction(businessType, snapshot.topProductName),
        impactLabel: formatImpactLabel(pushImpact, {
          fallback: "এটা সামনে রাখলে আজকের লাভ বাড়তে পারে",
        }),
        confidenceLabel:
          topProductShare >= 0.25 ? "ভরসা বেশি" : "ভরসা মাঝারি",
        guardrail:
          "কম লাভের পণ্যে বেশি ডিসকাউন্ট দেবেন না; আগে সামনে রেখে বিক্রি বাড়ান।",
      },
      topProductShare >= 0.25 ? 91 : 78
    );
  }

  if (lowStockRisk) {
    const restockImpact = Math.max(
      24,
      roundMoney(
        (topProductIsStockRisk
          ? snapshot.topProductRevenue * 0.18
          : Math.max(snapshot.topProductRevenue * 0.1, snapshot.average7d.sales * 0.08)) *
          blendedMarginRate
      )
    );
    addPlaybook(
      {
        id: "restock-fast-movers",
        tone: topProductIsStockRisk ? "danger" : "warning",
        title: topProductIsStockRisk
          ? `${snapshot.lowestStockName} শেষ হয়ে যাওয়ার ঝুঁকিতে`
          : "চলতি পণ্যের স্টক কমে যাচ্ছে",
        reason:
          snapshot.lowestStockName && snapshot.lowestStockQty !== null
            ? `${snapshot.lowestStockName} stock এখন ${snapshot.lowestStockQty.toFixed(
                snapshot.lowestStockQty % 1 === 0 ? 0 : 2
              )}। ${snapshot.lowStockCount}টি পণ্যের স্টক কমে গেছে।`
            : `${snapshot.lowStockCount}টি পণ্যের স্টক কমে গেছে।`,
        action: snapshot.lowestStockName
          ? `${snapshot.lowestStockName} সহ বেশি বিক্রি হওয়া পণ্য আজই রি-অর্ডার দিন।`
          : "যেসব পণ্যের স্টক কম, সেগুলো আজই রি-অর্ডার দিন।",
        impactLabel: formatImpactLabel(restockImpact, {
          fallback: "স্টক ঠিক থাকলে বিক্রি মিস কমবে",
        }),
        confidenceLabel: topProductIsStockRisk ? "ভরসা বেশি" : "ভরসা মাঝারি",
        guardrail: "ধীরে বিক্রি হওয়া পণ্য বেশি করে কিনবেন না; চলতি পণ্য আগে তুলুন।",
      },
      topProductIsStockRisk ? 96 : 83
    );
  }

  if (expenseSpike || excessExpense > 0) {
    const expenseImpact = Math.max(
      15,
      roundMoney(
        Math.max(excessExpense * 0.55, snapshot.topExpenseCategoryAmount * 0.25)
      )
    );
    addPlaybook(
      {
        id: "expense-trim",
        tone: expenseSpike ? "warning" : "primary",
        title: "খরচ কমালে লাভ দ্রুত বাড়বে",
        reason: snapshot.topExpenseCategoryName
          ? `আজ মোট খরচ ${formatMoney(expenses)}। ${snapshot.topExpenseCategoryName} category একাই ${formatMoney(
              snapshot.topExpenseCategoryAmount
            )} নিয়েছে।`
          : `আজ মোট খরচ ${formatMoney(expenses)}; এটা ৭ দিনের গড় ${formatMoney(
              snapshot.average7d.expenses
            )}-এর উপরে।`,
        action: snapshot.topExpenseCategoryName
          ? `${snapshot.topExpenseCategoryName} খরচগুলো দেখে অপ্রয়োজনীয় খরচ বন্ধ করুন।`
          : "আজকের খরচ দেখে অপ্রয়োজনীয় খরচ বন্ধ করুন।",
        impactLabel: formatImpactLabel(expenseImpact, {
          fallback: "অপ্রয়োজনীয় খরচ বন্ধ করলে লাভ বাড়বে",
        }),
        confidenceLabel: expenseSpike ? "ভরসা বেশি" : "ভরসা মাঝারি",
        guardrail:
          "দোকানের দরকারি স্টক বা সার্ভিস কমাবেন না; আগে অপ্রয়োজনীয় খরচ কমান।",
      },
      expenseSpike ? 94 : 72
    );
  }

  if (queuePressure && (isFoodType(businessType) || businessType.includes("salon"))) {
    const queueImpact = Math.max(
      18,
      roundMoney(
        Math.max(averageTicket, snapshot.average7d.sales / 10, 80) *
          Math.min(snapshot.queuePendingCount, 3) *
          blendedMarginRate *
          0.55
      )
    );
    addPlaybook(
      {
        id: "queue-speed",
        tone: "primary",
        title: "কিউ দ্রুত শেষ করলে বাড়তি বিক্রি পাওয়া যাবে",
        reason: `এখন ${snapshot.queuePendingCount}টি টোকেন অপেক্ষায় আছে। দেরি হলে কাস্টমার কমে যেতে পারে।`,
        action:
          "দ্রুত আইটেম আগে দিন, আর টোকেন ধরে ধরে দ্রুত সার্ভ করুন।",
        impactLabel: formatImpactLabel(queueImpact, {
          fallback: "অপেক্ষা কমলে একই সময়ে বেশি বিক্রি হবে",
        }),
        confidenceLabel: "ভরসা মাঝারি",
        guardrail:
          "দ্রুত করতে গিয়ে অর্ডার ভুল বা সার্ভিস খারাপ করবেন না।",
      },
      74
    );
  }

  if (duePressureHigh) {
    const cashUnlock = Math.max(
      50,
      roundMoney(
        Math.min(snapshot.dueTotal * 0.3, Math.max(snapshot.average7d.sales * 0.4, 200))
      )
    );
    addPlaybook(
      {
        id: "due-recovery",
        tone: "warning",
        title: "বাকি তুললে হাতে নগদ বাড়বে",
        reason:
          snapshot.topDueCustomerName && snapshot.topDueCustomerAmount > 0
            ? `${snapshot.topDueCustomerName}-এর কাছেই ${formatMoney(
                snapshot.topDueCustomerAmount
              )} due আছে; মোট due ${formatMoney(snapshot.dueTotal)}।`
            : `মোট due এখন ${formatMoney(snapshot.dueTotal)}।`,
        action:
          "যাদের বাকি বেশি তাদের আগে টাকা তুলুন, তারপর সেই টাকা চলতি স্টকে দিন।",
        impactLabel: formatImpactLabel(cashUnlock, {
          type: "cash",
          fallback: "বাকি তুললে নতুন বিক্রি চালিয়ে যাওয়া সহজ হবে",
        }),
        confidenceLabel: "ভরসা মাঝারি",
        guardrail:
          "পুরনো বাকি না তোলা পর্যন্ত নতুন বড় বাকি কম দিন।",
      },
      lowStockRisk ? 79 : 66
    );
  }

  if (playbookCandidates.length === 0) {
    addPlaybook(
      {
        id: "steady-day-discipline",
        tone: "success",
        title: "আজ নিয়ম মেনে চললে লাভ ঠিক থাকবে",
        reason:
          salesVsAverage !== null && Math.abs(salesVsAverage) >= 0.5
            ? `আজকের sales ${avgLabel(sales, snapshot.average7d.sales, "বিক্রির ৭ দিনের গড়")}।`
            : "আজ বড় কোনো risk spike ধরা পড়েনি।",
        action:
          "সবচেয়ে বেশি বিক্রি হওয়া ৩টা পণ্য সামনে রাখুন, অপ্রয়োজনীয় খরচ বন্ধ রাখুন, শিফট শেষে ক্যাশ-বাকি মিলান।",
        impactLabel: "আজ লাভ ঠিক রাখার দিকে ফোকাস দিন",
        confidenceLabel: "ভরসা কম",
        guardrail: "অপ্রয়োজনীয় ডিসকাউন্ট বা হঠাৎ খরচ করে আজকের লাভ কমাবেন না।",
      },
      40
    );
  }

  const playbook = playbookCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score: _score, ...item }) => item);

  for (const item of playbook) {
    addActionNote(item.action);
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
      : "আজ এখনও বিক্রি হয়নি। বিক্রি শুরু, বাকি তোলা আর খরচ নিয়ন্ত্রণে ফোকাস দিন।";
  let priorityLabel = "দিন ভালো";

  if (profitVsYesterday !== null && profitVsYesterday <= -8) {
    tone = "warning";
    badge = "লাভ কমেছে";
    headline = `আজ লাভ গতকালের তুলনায় ${Math.abs(profitVsYesterday).toFixed(1)}% কম।`;
    overview = expenseSpike
      ? `মূল চাপ এসেছে খরচের দিক থেকে। ${avgLabel(
          expenses,
          snapshot.average7d.expenses,
          "খরচের ৭ দিনের গড়"
        )}.`
      : duePressureHigh
        ? "বিক্রি হয়েছে, কিন্তু বাকি বেশি থাকায় হাতে নগদ কম আসছে।"
        : lowStockRisk
          ? "স্টক কম থাকায় কিছু বিক্রি মিস হওয়ার ঝুঁকি আছে।"
          : `${avgLabel(
              profit,
              snapshot.average7d.profit,
              "লাভের ৭ দিনের গড়"
            )}। একটু দেখে ঠিক করলে লাভ বাড়বে।`;
    priorityLabel = "লাভ বাড়ান";
  } else if (profitVsYesterday !== null && profitVsYesterday >= 8) {
    tone = "success";
    badge = "লাভ বেড়েছে";
    headline = `আজ লাভ গতকালের তুলনায় ${Math.abs(profitVsYesterday).toFixed(1)}% বেশি।`;
    overview = snapshot.topProductName
      ? `${snapshot.topProductName} আজ ভালো বিক্রি দিচ্ছে। ${avgLabel(
          sales,
          snapshot.average7d.sales,
          "বিক্রির ৭ দিনের গড়"
        )}.`
      : `${avgLabel(sales, snapshot.average7d.sales, "বিক্রির ৭ দিনের গড়")}। এই ধারা ধরে রাখুন।`;
    priorityLabel = "এভাবেই চালান";
  } else if (duePressureHigh) {
    tone = "warning";
    badge = "বাকি চাপ";
    headline = "আজ বাকি তুললে হাতে টাকা দ্রুত বাড়বে।";
    overview =
      snapshot.topDueCustomerName && snapshot.topDueCustomerAmount > 0
        ? `${snapshot.topDueCustomerName}-এর কাছেই সবচেয়ে বেশি বাকি: ${formatMoney(
            snapshot.topDueCustomerAmount
          )}.`
        : `মোট বাকি এখন ${formatMoney(snapshot.dueTotal)}।`;
    priorityLabel = "বাকি তুলুন";
  } else if (lowStockRisk) {
    tone = "danger";
    badge = "স্টক কম";
    headline = "স্টক কমে যাচ্ছে, এখনই তুললে বিক্রি মিস হবে না।";
    overview = snapshot.lowestStockName
      ? `${snapshot.lowestStockName} এখন সবচেয়ে নিচের দিকে। ${
          snapshot.topProductName === snapshot.lowestStockName
            ? "এটাই বেশি বিক্রি হচ্ছে, তাই আগে এটা তুলুন।"
            : "এই আইটেমের স্টক দ্রুত শেষ হতে পারে।"
        }`
      : "কিছু পণ্যের স্টক দ্রুত কমে যাচ্ছে।";
    priorityLabel = "স্টক তুলুন";
  } else if (queuePressure && (isFoodType(businessType) || businessType.includes("salon"))) {
    tone = "primary";
    badge = "ভিড় বেশি";
    headline = "কিউ দ্রুত কমালে একই সময়ে বেশি বিক্রি হবে।";
    overview = `এখন ${snapshot.queuePendingCount}টি টোকেন অপেক্ষায় আছে। দ্রুত সার্ভ করলে আয় বাড়বে।`;
    priorityLabel = "কিউ কমান";
  } else if (salesVsYesterday !== null && salesVsYesterday <= -10) {
    tone = "warning";
    badge = "বিক্রি কমেছে";
    headline = `আজ বিক্রি গতকালের তুলনায় ${Math.abs(salesVsYesterday).toFixed(1)}% কম।`;
    overview = snapshot.topProductName
      ? `${snapshot.topProductName} সামনে রাখুন এবং দ্রুত বিক্রিতে এটাকে আগে দিন।`
      : "যেসব পণ্য বেশি বিক্রি হয়, সেগুলো সামনে রাখলে দ্রুত বিক্রি বাড়বে।";
    priorityLabel = "বিক্রি বাড়ান";
  }

  return {
    tone,
    badge,
    headline,
    overview,
    priorityLabel,
    metrics,
    bullets: bullets.slice(0, 3),
    playbook,
    actionNotes: actionNotes.slice(0, 3),
    actions: actions.slice(0, 3),
  };
}
