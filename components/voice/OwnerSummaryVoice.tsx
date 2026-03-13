"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { updateShop } from "@/app/actions/shops";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";
import { computePresetRange, getDhakaDateString } from "@/lib/reporting-range";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type Summary = {
  sales?: { total?: number } | number;
  expenses?: { total?: number } | number;
  profit?: number;
  cash?: { balance?: number } | null;
  balance?: number;
};

type Props = {
  userId?: string | null;
  roles?: string[] | null;
  shopId?: string | null;
  closingTime?: string | null;
  online?: boolean;
};

const DEFAULT_ALERT_INTERVAL_MINUTES = 30;
const ALERT_INTERVAL_MIN_MINUTES = 5;
const ALERT_INTERVAL_MAX_MINUTES = 180;
const PRESET_INTERVALS = [5, 10, 15, 30, 60, 120];
const DEFAULT_CLOSING_TIME = "22:00";
const REMINDER_DELAY_MINUTES = 10;
const EXPORT_PAGE_LIMIT = 20;
const EXPORT_MAX_PAGES = 250;
const EXPORT_MAX_ROWS = 5000;

function getSummaryTotal(value?: { total?: number } | number) {
  if (typeof value === "number") return value;
  return value?.total ?? 0;
}

function formatMoneyBn(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildSummaryText(summary: Summary | null) {
  if (!summary) return "আজকের সারাংশ পাওয়া যায়নি।";
  const salesTotal = Number(getSummaryTotal(summary.sales));
  const expenseTotal = Number(getSummaryTotal(summary.expenses));
  const profitTotal = Number(summary.profit ?? 0);
  const cashBalance = Number(summary.cash?.balance ?? summary.balance ?? 0);

  return `আজকের সারাংশ। বিক্রি ${formatMoneyBn(
    salesTotal
  )} টাকা, খরচ ${formatMoneyBn(
    expenseTotal
  )} টাকা, লাভ ${formatMoneyBn(
    profitTotal
  )} টাকা, ক্যাশ ব্যালেন্স ${formatMoneyBn(cashBalance)} টাকা।`;
}

function buildToastText(summary: Summary | null) {
  if (!summary) return "আজকের সারাংশ আপডেট হয়েছে।";
  const salesTotal = Number(getSummaryTotal(summary.sales));
  const expenseTotal = Number(getSummaryTotal(summary.expenses));
  return `সারাংশ আপডেট: বিক্রি ${formatMoneyBn(
    salesTotal
  )}৳, খরচ ${formatMoneyBn(expenseTotal)}৳`;
}

function normalizeIntervalMinutes(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_ALERT_INTERVAL_MINUTES;
  return Math.min(
    ALERT_INTERVAL_MAX_MINUTES,
    Math.max(ALERT_INTERVAL_MIN_MINUTES, Math.round(value))
  );
}

function normalizeClosingTime(value?: string | null) {
  if (!value) return DEFAULT_CLOSING_TIME;
  const trimmed = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  return match ? trimmed : DEFAULT_CLOSING_TIME;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function getDhakaNowMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export default function OwnerSummaryVoice({
  userId,
  roles,
  shopId,
  closingTime,
  online = true,
}: Props) {
  const isOwner = roles?.includes("owner") ?? false;
  const isEnabledUser = Boolean(userId && isOwner && shopId);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertText, setAlertText] = useState("");
  const [alertSummary, setAlertSummary] = useState<Summary | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(
    DEFAULT_ALERT_INTERVAL_MINUTES
  );
  const [closingTimeValue, setClosingTimeValue] = useState(
    normalizeClosingTime(closingTime)
  );
  const [closingTimeSaving, startClosingTimeTransition] = useTransition();
  const [closingTimeError, setClosingTimeError] = useState<string | null>(null);
  const [reportReminderEnabled, setReportReminderEnabled] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportDownloadBusy, setReportDownloadBusy] = useState(false);
  const [reportDownloadError, setReportDownloadError] = useState<string | null>(
    null
  );
  const lastAlertAtRef = useRef(0);
  const lastSummaryRef = useRef<Summary | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const alertStorageKey = useMemo(
    () => (userId ? `owner:voice-summary:${userId}` : "owner:voice-summary"),
    [userId]
  );
  const reminderStorageKey = useMemo(
    () =>
      userId && shopId
        ? `owner:daily-report-reminder:${userId}:${shopId}`
        : "owner:daily-report-reminder",
    [userId, shopId]
  );
  const intervalStorageKey = useMemo(
    () =>
      userId
        ? `owner:voice-summary-interval:${userId}`
        : "owner:voice-summary-interval",
    [userId]
  );
  const notificationStorageKey = useMemo(
    () =>
      userId
        ? `owner:summary-notify:${userId}`
        : "owner:summary-notify",
    [userId]
  );
  const reportReminderEnabledKey = useMemo(
    () =>
      userId && shopId
        ? `owner:daily-report-enabled:${userId}:${shopId}`
        : "owner:daily-report-enabled",
    [userId, shopId]
  );

  useEffect(() => {
    if (!isEnabledUser) return;
    try {
      const stored = safeLocalStorageGet(alertStorageKey);
      if (stored === "1") setAlertsEnabled(true);
      const storedInterval = safeLocalStorageGet(intervalStorageKey);
      if (storedInterval) {
        setIntervalMinutes(normalizeIntervalMinutes(Number(storedInterval)));
      }
      const storedReportEnabled = safeLocalStorageGet(reportReminderEnabledKey);
      if (storedReportEnabled === "0") {
        setReportReminderEnabled(false);
      }
    } catch {
      // ignore storage errors
    }
  }, [isEnabledUser, alertStorageKey, intervalStorageKey, reportReminderEnabledKey]);

  useEffect(() => {
    if (!isEnabledUser) return;
    setClosingTimeValue(normalizeClosingTime(closingTime));
  }, [closingTime, isEnabledUser, shopId]);

  useEffect(() => {
    if (!isEnabledUser) return;
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationSupported(false);
      return;
    }
    setNotificationSupported(true);
    setNotificationPermission(Notification.permission);
    try {
      const stored = safeLocalStorageGet(notificationStorageKey);
      if (stored === "1" && Notification.permission === "granted") {
        setNotificationEnabled(true);
      }
    } catch {
      // ignore storage errors
    }
  }, [isEnabledUser, notificationStorageKey]);

  const playChime = useCallback(async () => {
    if (typeof window === "undefined") return;
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!notificationSupported || !isEnabledUser) return;
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        setNotificationEnabled(true);
        try {
          safeLocalStorageSet(notificationStorageKey, "1");
        } catch {
          // ignore storage errors
        }
        toast.success("নোটিফিকেশন চালু হয়েছে");
      } else {
        setNotificationEnabled(false);
        try {
          safeLocalStorageSet(notificationStorageKey, "0");
        } catch {
          // ignore storage errors
        }
        if (permission === "denied") {
          toast.error("নোটিফিকেশন ব্রাউজারে ব্লক করা হয়েছে");
        }
      }
    } catch {
      toast.error("নোটিফিকেশন চালু করা যাচ্ছে না");
    }
  }, [notificationSupported, isEnabledUser, notificationStorageKey]);

  const toggleNotifications = useCallback(() => {
    if (!notificationSupported || !isEnabledUser) return;
    if (notificationPermission === "denied") {
      toast.error("নোটিফিকেশন ব্রাউজারে ব্লক করা হয়েছে");
      return;
    }
    if (notificationEnabled) {
      setNotificationEnabled(false);
      try {
        safeLocalStorageSet(notificationStorageKey, "0");
      } catch {
        // ignore storage errors
      }
      return;
    }
    if (notificationPermission === "granted") {
      setNotificationEnabled(true);
      try {
        safeLocalStorageSet(notificationStorageKey, "1");
      } catch {
        // ignore storage errors
      }
      toast.success("নোটিফিকেশন চালু হয়েছে");
      return;
    }
    void requestNotificationPermission();
  }, [
    notificationSupported,
    isEnabledUser,
    notificationEnabled,
    notificationPermission,
    notificationStorageKey,
    requestNotificationPermission,
  ]);

  const showSummaryAlert = useCallback(
    async (source: "auto" | "manual" = "auto") => {
      if (!isEnabledUser || !shopId) return;
      const isVisible =
        typeof document === "undefined" ||
        document.visibilityState === "visible";
      if (source === "auto") {
        if (!alertsEnabled || !online) return;
        if (isVisible && alertDialogOpen) return;
      }

      const now = Date.now();
      if (now - lastAlertAtRef.current < 5_000) return;
      lastAlertAtRef.current = now;

      let summaryForAlert: Summary | null = lastSummaryRef.current;
      let fetchFailed = false;
      try {
        const res = await fetch(
          `/api/reports/today-summary?shopId=${shopId}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          summaryForAlert = (await res.json()) as Summary;
          lastSummaryRef.current = summaryForAlert;
        } else {
          fetchFailed = true;
        }
      } catch {
        fetchFailed = true;
      }

      const text = buildSummaryText(summaryForAlert);
      if (source === "manual" || isVisible) {
        setAlertText(text);
        setAlertSummary(summaryForAlert);
        setAlertError(
          fetchFailed ? "সারাংশ আপডেট হয়নি, আগের তথ্য দেখানো হচ্ছে।" : null
        );
        setAlertDialogOpen(true);
        if (fetchFailed && !summaryForAlert) {
          toast.error("সারাংশ পাওয়া যায়নি।");
        } else {
          toast.success(buildToastText(summaryForAlert));
        }
        void playChime();
      }

      if (
        notificationSupported &&
        notificationEnabled &&
        notificationPermission === "granted" &&
        source === "auto" &&
        !isVisible
      ) {
        try {
          new Notification("আজকের সারাংশ", {
            body: buildToastText(summaryForAlert),
            tag: "pos-summary",
          });
        } catch {
          // ignore notification errors
        }
      }
    },
    [
      isEnabledUser,
      shopId,
      alertsEnabled,
      online,
      alertDialogOpen,
      playChime,
      notificationSupported,
      notificationEnabled,
      notificationPermission,
    ]
  );

  const toggleAlerts = useCallback(() => {
    if (!isEnabledUser) return;
    const next = !alertsEnabled;
    setAlertsEnabled(next);
    try {
      safeLocalStorageSet(alertStorageKey, next ? "1" : "0");
    } catch {
      // ignore storage errors
    }
    if (next) {
      void showSummaryAlert("manual");
    }
  }, [isEnabledUser, alertsEnabled, alertStorageKey, showSummaryAlert]);

  const downloadDailyReports = useCallback(async () => {
    if (!shopId) return;
    if (!online) {
      toast.error("অফলাইনে রিপোর্ট ডাউনলোড করা যাবে না");
      return;
    }

    const { from, to } = computePresetRange("today");
    const dateLabel = from ?? getDhakaDateString();
    setReportDownloadBusy(true);
    setReportDownloadError(null);
    const toastId = toast.success("রিপোর্ট ডাউনলোড হচ্ছে...");

    const fetchAllRows = async (endpoint: string) => {
      const rows: any[] = [];
      let cursor: { at: string; id: string } | null = null;
      let pages = 0;

      while (true) {
        const params = new URLSearchParams({
          shopId,
          limit: String(EXPORT_PAGE_LIMIT),
        });
        if (from) params.append("from", from);
        if (to) params.append("to", to);
        if (cursor) {
          params.append("cursorAt", cursor.at);
          params.append("cursorId", cursor.id);
        }

        const res = await fetch(`${endpoint}?${params.toString()}`);
        if (!res.ok) {
          throw new Error("Report fetch failed");
        }
        const data = await res.json();
        const nextRows = Array.isArray(data.rows) ? data.rows : [];
        rows.push(...nextRows);

        if (rows.length > EXPORT_MAX_ROWS) {
          throw new Error("Too many rows to export");
        }

        if (!data.hasMore || !data.nextCursor) break;
        cursor = data.nextCursor;
        pages += 1;
        if (pages >= EXPORT_MAX_PAGES) {
          throw new Error("Export limit reached");
        }
      }

      return rows;
    };

    try {
      const [summaryRes, salesRows, expenseRows, cashRows] = await Promise.all([
        fetch(`/api/reports/summary?shopId=${shopId}&from=${from}&to=${to}&fresh=1`),
        fetchAllRows("/api/reports/sales"),
        fetchAllRows("/api/reports/expenses"),
        fetchAllRows("/api/reports/cash"),
      ]);

      if (!summaryRes.ok) {
        throw new Error("Summary fetch failed");
      }
      const summary = await summaryRes.json();

      const summaryCsv = generateCSV(
        [
          "date",
          "sales_total",
          "sales_count",
          "expense_total",
          "expense_count",
          "cash_in",
          "cash_out",
          "cash_balance",
          "profit",
          "cogs",
        ],
        [
          {
            date: dateLabel,
            sales_total: summary.sales?.totalAmount ?? 0,
            sales_count: summary.sales?.count ?? 0,
            expense_total: summary.expense?.totalAmount ?? 0,
            expense_count: summary.expense?.count ?? 0,
            cash_in: summary.cash?.totalIn ?? 0,
            cash_out: summary.cash?.totalOut ?? 0,
            cash_balance: summary.cash?.balance ?? 0,
            profit: summary.profit?.profit ?? 0,
            cogs: summary.profit?.cogs ?? 0,
          },
        ]
      );
      downloadFile(`summary-${dateLabel}.csv`, summaryCsv);

      const salesCsv = generateCSV(
        ["id", "saleDate", "totalAmount", "paymentMethod", "note"],
        salesRows
      );
      downloadFile(`sales-${dateLabel}.csv`, salesCsv);

      const expenseCsv = generateCSV(
        ["id", "expenseDate", "amount", "category"],
        expenseRows
      );
      downloadFile(`expenses-${dateLabel}.csv`, expenseCsv);

      const cashCsv = generateCSV(
        ["id", "createdAt", "entryType", "amount", "reason"],
        cashRows
      );
      downloadFile(`cashbook-${dateLabel}.csv`, cashCsv);

      toast.success("রিপোর্ট ডাউনলোড হয়েছে", { id: toastId });
    } catch (err) {
      handlePermissionError(err);
      setReportDownloadError("রিপোর্ট ডাউনলোড করা যায়নি");
      toast.error("রিপোর্ট ডাউনলোড করা যায়নি", { id: toastId });
    } finally {
      setReportDownloadBusy(false);
    }
  }, [shopId, online]);

  useEffect(() => {
    if (!isEnabledUser || !alertsEnabled) return;
    const intervalMs = normalizeIntervalMinutes(intervalMinutes) * 60_000;
    const id = setInterval(() => {
      void showSummaryAlert("auto");
    }, intervalMs);
    return () => clearInterval(id);
  }, [isEnabledUser, alertsEnabled, showSummaryAlert, intervalMinutes]);

  const triggerReportReminder = useCallback(
    (isVisible: boolean) => {
      const text = "দিন শেষ হয়েছে। আজকের রিপোর্ট ডাউনলোড করে রাখুন।";
      if (isVisible) {
        setReportText(text);
        setReportDialogOpen(true);
        toast.success("দিনশেষ রিপোর্ট প্রস্তুত");
        void playChime();
      }

      if (
        notificationSupported &&
        notificationEnabled &&
        notificationPermission === "granted" &&
        !isVisible
      ) {
        try {
          new Notification("দিনশেষ রিপোর্ট", {
            body: "আজকের রিপোর্ট ডাউনলোড করে রাখুন।",
            tag: "pos-daily-report",
          });
        } catch {
          // ignore notification errors
        }
      }
    },
    [
      notificationSupported,
      notificationEnabled,
      notificationPermission,
      playChime,
    ]
  );

  useEffect(() => {
    if (!isEnabledUser || !shopId || !reportReminderEnabled) return;
    const normalizedClosing = normalizeClosingTime(closingTimeValue);
    const closingMinutes = timeToMinutes(normalizedClosing);
    if (closingMinutes === null) return;

    const checkReminder = () => {
      const todayKey = getDhakaDateString();
      const lastReminder = (() => {
        try {
          return safeLocalStorageGet(reminderStorageKey);
        } catch {
          return null;
        }
      })();
      if (lastReminder === todayKey) return;

      const nowMinutes = getDhakaNowMinutes();
      if (nowMinutes >= closingMinutes + REMINDER_DELAY_MINUTES) {
        const isVisible =
          typeof document === "undefined" ||
          document.visibilityState === "visible";
        triggerReportReminder(isVisible);
        try {
          safeLocalStorageSet(reminderStorageKey, todayKey);
        } catch {
          // ignore storage errors
        }
      }
    };

    checkReminder();
    const id = setInterval(checkReminder, 60_000);
    return () => clearInterval(id);
  }, [
    isEnabledUser,
    shopId,
    reportReminderEnabled,
    closingTimeValue,
    reminderStorageKey,
    triggerReportReminder,
  ]);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const commitIntervalMinutes = useCallback(
    (value: number) => {
      const normalized = normalizeIntervalMinutes(value);
      setIntervalMinutes(normalized);
      try {
        safeLocalStorageSet(intervalStorageKey, String(normalized));
      } catch {
        // ignore storage errors
      }
    },
    [intervalStorageKey]
  );

  const saveClosingTime = useCallback(() => {
    if (!shopId) return;
    const normalized = normalizeClosingTime(closingTimeValue);
    setClosingTimeError(null);
    startClosingTimeTransition(async () => {
      try {
        await updateShop(shopId, { closingTime: normalized });
        setClosingTimeValue(normalized);
        toast.success("ক্লোজিং টাইম সেভ হয়েছে");
      } catch (err) {
        handlePermissionError(err);
        setClosingTimeError("ক্লোজিং টাইম সেভ করা যায়নি");
        toast.error("ক্লোজিং টাইম সেভ করা যায়নি");
      }
    });
  }, [shopId, closingTimeValue]);

  const toggleReportReminder = useCallback(() => {
    const next = !reportReminderEnabled;
    setReportReminderEnabled(next);
    try {
      safeLocalStorageSet(reportReminderEnabledKey, next ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [reportReminderEnabled, reportReminderEnabledKey]);

  if (!isEnabledUser) return null;

  const notificationLabel =
    notificationPermission === "denied"
      ? "ব্রাউজারে ব্লক"
      : notificationEnabled
        ? "চালু আছে"
        : "চালু নয়";
  const summaryAlertStatusLabel = alertsEnabled ? "চালু" : "বন্ধ";
  const reminderStatusLabel = reportReminderEnabled ? "চালু" : "বন্ধ";
  const browserNotificationHelpText =
    notificationPermission === "denied"
      ? "ব্রাউজার থেকে নোটিফিকেশন ব্লক করা আছে। ব্রাউজার settings থেকে Allow করতে হবে।"
      : notificationEnabled
        ? "ট্যাব বন্ধ থাকলেও summary reminder পাওয়ার জন্য প্রস্তুত।"
        : "চালু করলে browser notification-এ summary reminder পাবেন।";
  const summarySales = Number(getSummaryTotal(alertSummary?.sales));
  const summaryExpense = Number(getSummaryTotal(alertSummary?.expenses));
  const summaryProfit = Number(alertSummary?.profit ?? 0);
  const summaryCash = Number(alertSummary?.cash?.balance ?? alertSummary?.balance ?? 0);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={openSettings}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm ${
          alertsEnabled
            ? "border-primary/40 bg-primary-soft text-primary"
            : "border-border bg-card text-foreground"
        }`}
        aria-label="সারাংশ সেটিংস"
        title="সারাংশ সেটিংস"
      >
        <span className="text-sm">{alertsEnabled ? "🔔" : "🔕"}</span>
        {alertsEnabled ? (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success" />
        ) : null}
      </button>

      <Dialog
        open={alertDialogOpen}
        onOpenChange={setAlertDialogOpen}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60 bg-gradient-to-br from-primary-soft/60 via-card to-warning-soft/40">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-bold text-foreground">
                  আজকের সারাংশ
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  আজকের গুরুত্বপূর্ণ বিক্রি ও ব্যয়ের আপডেট
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                <span className="text-sm">⏱️</span>
                {getDhakaDateString(new Date())}
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-card/80 p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-success-soft text-success">
                    💸
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    বিক্রি
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold text-foreground">
                  ৳ {formatMoneyBn(summarySales)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger-soft text-danger">
                    🧾
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    খরচ
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold text-foreground">
                  ৳ {formatMoneyBn(summaryExpense)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
                    💎
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    লাভ
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold text-foreground">
                  ৳ {formatMoneyBn(summaryProfit)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-warning-soft text-warning">
                    💰
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    ক্যাশ
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold text-foreground">
                  ৳ {formatMoneyBn(summaryCash)}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-foreground">
              {alertText}
            </div>
            {alertError ? (
              <div className="rounded-xl border border-danger/40 bg-danger-soft/60 px-3 py-2 text-sm text-danger">
                {alertError}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setAlertDialogOpen(false)}
              className="w-full h-11 rounded-xl border border-border bg-card text-foreground text-sm font-semibold hover:bg-muted transition"
            >
              বন্ধ করুন
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>দিনশেষ রিপোর্ট</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{reportText}</p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportDialogOpen(false)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                পরে
              </button>
              <button
                type="button"
                onClick={downloadDailyReports}
                className={buttonVariants({ size: "sm" })}
                disabled={reportDownloadBusy}
              >
                {reportDownloadBusy ? "ডাউনলোড হচ্ছে..." : "ডাউনলোড"}
              </button>
            </div>
            {reportDownloadError ? (
              <p className="text-xs text-danger">{reportDownloadError}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-none w-full max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-lg sm:max-w-lg !left-0 !right-0 !bottom-0 !top-auto !translate-x-0 !translate-y-0 sm:!left-[50%] sm:!top-[50%] sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:!right-auto sm:!bottom-auto">
          <DialogHeader>
            <DialogTitle>নোটিফিকেশন সেটিংস</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-border/60 bg-muted/35 px-3 py-3">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  সারাংশ
                </p>
                <p className="mt-1 text-sm font-bold text-foreground">
                  {summaryAlertStatusLabel}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/35 px-3 py-3">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  ব্রাউজার নোটিফাই
                </p>
                <p className="mt-1 text-sm font-bold text-foreground">
                  {notificationLabel}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/35 px-3 py-3">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  দিনশেষ রিমাইন্ডার
                </p>
                <p className="mt-1 text-sm font-bold text-foreground">
                  {reminderStatusLabel}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    আজকের সারাংশ দেখান
                  </p>
                  <p className="text-xs text-muted-foreground">
                    নির্দিষ্ট সময় পর পর আজকের বিক্রি, খরচ, লাভ দেখাবে।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleAlerts}
                  className={buttonVariants({
                    variant: alertsEnabled ? "default" : "outline",
                    size: "sm",
                  })}
                >
                  {alertsEnabled ? "বন্ধ করুন" : "চালু করুন"}
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  কতক্ষণ পর পর দেখাবেন
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_INTERVALS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => commitIntervalMinutes(minutes)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${
                        minutes === intervalMinutes
                          ? "border-primary/40 bg-primary-soft text-primary"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      {minutes} মিনিট
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    void showSummaryAlert("manual");
                  }}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  এখনই দেখুন
                </button>
                <span className="text-xs text-muted-foreground">
                  বর্তমান interval: {intervalMinutes} মিনিট
                </span>
              </div>
            </div>

            {notificationSupported ? (
              <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      ব্রাউজার নোটিফাই
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ট্যাব ব্যাকগ্রাউন্ডে থাকলেও নোটিস পাবেন।
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleNotifications}
                    className={buttonVariants({
                      variant: notificationEnabled ? "default" : "outline",
                      size: "sm",
                    })}
                    disabled={notificationPermission === "denied"}
                  >
                    {notificationEnabled ? "বন্ধ করুন" : "চালু করুন"}
                  </button>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                  {browserNotificationHelpText}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    দিনশেষ রিপোর্ট রিমাইন্ডার
                  </p>
                  <p className="text-xs text-muted-foreground">
                    দোকান বন্ধের পর রিপোর্ট ডাউনলোডের কথা মনে করিয়ে দেবে।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleReportReminder}
                  className={buttonVariants({
                    variant: reportReminderEnabled ? "default" : "outline",
                    size: "sm",
                  })}
                >
                  {reportReminderEnabled ? "বন্ধ করুন" : "চালু করুন"}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  ক্লোজিং টাইম (২৪ ঘন্টা ফরম্যাট)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="time"
                    value={closingTimeValue}
                    onChange={(event) => {
                      setClosingTimeValue(event.target.value);
                      setClosingTimeError(null);
                    }}
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={saveClosingTime}
                    className={buttonVariants({ size: "sm" })}
                    disabled={closingTimeSaving}
                  >
                    {closingTimeSaving ? "সেভ হচ্ছে..." : "সেভ করুন"}
                  </button>
                </div>
                {closingTimeError ? (
                  <p className="text-xs text-danger">{closingTimeError}</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                ক্লোজিং টাইম পার হওয়ার {REMINDER_DELAY_MINUTES} মিনিট পরে একবার রিমাইন্ডার দেখাবে।
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadDailyReports}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  disabled={reportDownloadBusy}
                >
                  {reportDownloadBusy ? "ডাউনলোড হচ্ছে..." : "আজকের রিপোর্ট ডাউনলোড করুন"}
                </button>
                {reportDownloadError ? (
                  <span className="text-xs text-danger">
                    {reportDownloadError}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
