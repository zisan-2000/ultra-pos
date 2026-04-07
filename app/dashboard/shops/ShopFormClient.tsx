// app/dashboard/shops/ShopFormClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { businessOptions } from "@/lib/productFormConfig";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { queueAdminAction } from "@/lib/sync/queue";
import { db } from "@/lib/dexie/db";
import { handlePermissionError } from "@/lib/permission-toast";
import { requestFeatureAccess } from "@/app/actions/feature-access-requests";
import {
  FEATURE_ACCESS_META,
  type FeatureAccessKey,
  type FeatureAccessRequestStatus,
} from "@/lib/feature-access";
import {
  getSpeechRecognitionCtor,
  mapVoiceErrorBangla,
  startDualLanguageVoice,
  type VoiceSession,
} from "@/lib/voice-recognition";
import {
  DEFAULT_SALES_INVOICE_PRINT_SIZE,
  SALES_INVOICE_PRINT_SIZE_OPTIONS,
  sanitizeSalesInvoicePrintSize,
} from "@/lib/sales-invoice-print";

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

type ShopTemplate = {
  name: string;
  address?: string;
  phone?: string;
  businessType: string;
  count: number;
  lastUsed: number;
};

type VoiceField = "name" | "address" | "phone";

type FeatureAccessRequestSnapshot = {
  id: string;
  featureKey: FeatureAccessKey;
  status: FeatureAccessRequestStatus;
  reason: string | null;
  decisionNote: string | null;
  createdAtIso: string;
  decidedAtIso: string | null;
};

type Props = {
  backHref: string;
  action: (formData: FormData) => Promise<void>;
  cacheUserId?: string | null;
  shopId?: string | null;
  initial?: {
    name?: string;
    address?: string;
    phone?: string;
    businessType?: string;
    salesInvoiceEntitled?: boolean;
    salesInvoiceEnabled?: boolean;
    salesInvoicePrefix?: string | null;
    salesInvoicePrintSize?: string | null;
    queueTokenEntitled?: boolean;
    queueTokenEnabled?: boolean;
    queueTokenPrefix?: string | null;
    queueWorkflow?: string | null;
    discountFeatureEntitled?: boolean;
    discountEnabled?: boolean;
    taxFeatureEntitled?: boolean;
    taxEnabled?: boolean;
    taxLabel?: string | null;
    taxRate?: string | number | null;
    barcodeFeatureEntitled?: boolean;
    barcodeScanEnabled?: boolean;
    smsSummaryEntitled?: boolean;
    smsSummaryEnabled?: boolean;
    inventoryFeatureEntitled?: boolean;
    inventoryEnabled?: boolean;
    cogsFeatureEntitled?: boolean;
    cogsEnabled?: boolean;
  };
  submitLabel?: string;
  ownerOptions?: Array<{ id: string; name: string | null; email: string | null }>;
  businessTypeOptions?: Array<{ id: string; label: string }>;
  showSalesInvoiceSettings?: boolean;
  canEditSalesInvoiceEntitlement?: boolean;
  showQueueTokenSettings?: boolean;
  canEditQueueTokenEntitlement?: boolean;
  showDiscountSettings?: boolean;
  canEditDiscountEntitlement?: boolean;
  showTaxSettings?: boolean;
  canEditTaxEntitlement?: boolean;
  showBarcodeSettings?: boolean;
  canEditBarcodeEntitlement?: boolean;
  showSmsSummarySettings?: boolean;
  canEditSmsSummaryEntitlement?: boolean;
  showInventorySettings?: boolean;
  canEditInventoryEntitlement?: boolean;
  showCogsSettings?: boolean;
  canEditCogsEntitlement?: boolean;
  featureAccessRequestByKey?: Partial<
    Record<FeatureAccessKey, FeatureAccessRequestSnapshot>
  >;
};

const SHOP_TEMPLATE_KEY = "shopTemplates:v1";

function mergeTemplates(existing: ShopTemplate[], incoming: ShopTemplate) {
  const idx = existing.findIndex((t) => t.name.toLowerCase() === incoming.name.toLowerCase());
  const next = [...existing];
  if (idx >= 0) {
    const current = next[idx];
    next[idx] = {
      ...current,
      address: incoming.address || current.address,
      phone: incoming.phone || current.phone,
      businessType: incoming.businessType || current.businessType,
      count: current.count + 1,
      lastUsed: incoming.lastUsed,
    };
  } else {
    next.unshift(incoming);
  }
  return next
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
    .slice(0, 40);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parsePhone(text: string) {
  const digits = text.replace(/\D/g, "");
  return digits ? digits.slice(0, 15) : "";
}

function parseSpokenNameAndPhone(spoken: string) {
  const phone = parsePhone(spoken);
  const name = phone ? spoken.replace(new RegExp(phone, "g"), "").trim() : spoken.trim();
  return { name, phone };
}

function isNextRedirectError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const maybe = err as { digest?: unknown; message?: unknown };
  const digest = typeof maybe.digest === "string" ? maybe.digest : "";
  const message = typeof maybe.message === "string" ? maybe.message : "";
  return digest.startsWith("NEXT_REDIRECT") || message.includes("NEXT_REDIRECT");
}

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

const EMPTY_FEATURE_ACCESS_REQUESTS: Partial<
  Record<FeatureAccessKey, FeatureAccessRequestSnapshot>
> = {};

const FEATURE_SECTION_META: Array<{
  key: FeatureAccessKey;
  title: string;
  anchorId: string;
}> = [
  { key: "sales_invoice", title: "Sales Invoice", anchorId: "feature-sales-invoice" },
  { key: "queue_token", title: "Queue Token", anchorId: "feature-queue-token" },
  { key: "discount", title: "Discount", anchorId: "feature-discount" },
  { key: "tax", title: "VAT/Tax", anchorId: "feature-tax" },
  { key: "barcode", title: "Barcode", anchorId: "feature-barcode" },
  { key: "inventory_cogs", title: "Purchases + Suppliers", anchorId: "feature-inventory-cogs" },
  { key: "cogs_analytics", title: "COGS Analytics", anchorId: "feature-cogs-analytics" },
  { key: "sms_summary", title: "SMS Summary", anchorId: "feature-sms-summary" },
];

export default function ShopFormClient({
  backHref,
  action,
  cacheUserId,
  shopId,
  initial,
  submitLabel = "+ নতুন দোকান তৈরি করুন",
  ownerOptions,
  businessTypeOptions,
  showSalesInvoiceSettings = false,
  canEditSalesInvoiceEntitlement = false,
  showQueueTokenSettings = false,
  canEditQueueTokenEntitlement = false,
  showDiscountSettings = false,
  canEditDiscountEntitlement = false,
  showTaxSettings = false,
  canEditTaxEntitlement = false,
  showBarcodeSettings = false,
  canEditBarcodeEntitlement = false,
  showSmsSummarySettings = false,
  canEditSmsSummaryEntitlement = false,
  showInventorySettings = false,
  canEditInventoryEntitlement = false,
  showCogsSettings = false,
  canEditCogsEntitlement = false,
  featureAccessRequestByKey = EMPTY_FEATURE_ACCESS_REQUESTS,
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const [templates, setTemplates] = useState<ShopTemplate[]>([]);
  const [voiceReady, setVoiceReady] = useState(false);
  const [listeningField, setListeningField] = useState<VoiceField | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [featureAccessRequests, setFeatureAccessRequests] = useState<
    Partial<Record<FeatureAccessKey, FeatureAccessRequestSnapshot>>
  >(featureAccessRequestByKey);
  const [featureRequestReasonByKey, setFeatureRequestReasonByKey] = useState<
    Partial<Record<FeatureAccessKey, string>>
  >({});
  const [featureRequestBusyKey, setFeatureRequestBusyKey] =
    useState<FeatureAccessKey | null>(null);
  const [featureRequestMessageByKey, setFeatureRequestMessageByKey] = useState<
    Partial<Record<FeatureAccessKey, string>>
  >({});

  const [name, setName] = useState(initial?.name || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const availableBusinessTypes = businessTypeOptions?.length ? businessTypeOptions : businessOptions;
  const [businessType, setBusinessType] = useState<string>(
    initial?.businessType || availableBusinessTypes[0]?.id || "tea_stall"
  );
  const [salesInvoiceEntitled, setSalesInvoiceEntitled] = useState<boolean>(
    Boolean(initial?.salesInvoiceEntitled ?? false)
  );
  const [salesInvoiceEnabled, setSalesInvoiceEnabled] = useState<boolean>(
    Boolean(initial?.salesInvoiceEntitled ?? false) &&
      Boolean(initial?.salesInvoiceEnabled ?? false)
  );
  const [salesInvoicePrefix, setSalesInvoicePrefix] = useState<string>(
    initial?.salesInvoicePrefix || "INV"
  );
  const [salesInvoicePrintSize, setSalesInvoicePrintSize] = useState<string>(
    sanitizeSalesInvoicePrintSize(
      initial?.salesInvoicePrintSize || DEFAULT_SALES_INVOICE_PRINT_SIZE
    )
  );
  const [queueTokenEntitled, setQueueTokenEntitled] = useState<boolean>(
    Boolean(initial?.queueTokenEntitled ?? false)
  );
  const [queueTokenEnabled, setQueueTokenEnabled] = useState<boolean>(
    Boolean(initial?.queueTokenEntitled ?? false) &&
      Boolean(initial?.queueTokenEnabled ?? false)
  );
  const [queueTokenPrefix, setQueueTokenPrefix] = useState<string>(
    initial?.queueTokenPrefix || "TK"
  );
  const [queueWorkflow, setQueueWorkflow] = useState<string>(
    initial?.queueWorkflow || ""
  );
  const [discountFeatureEntitled, setDiscountFeatureEntitled] = useState<boolean>(
    Boolean(initial?.discountFeatureEntitled ?? false)
  );
  const [discountEnabled, setDiscountEnabled] = useState<boolean>(
    Boolean(initial?.discountEnabled ?? false)
  );
  const [taxFeatureEntitled, setTaxFeatureEntitled] = useState<boolean>(
    Boolean(initial?.taxFeatureEntitled ?? false)
  );
  const [taxEnabled, setTaxEnabled] = useState<boolean>(
    Boolean(initial?.taxEnabled ?? false)
  );
  const [taxLabel, setTaxLabel] = useState<string>(initial?.taxLabel || "VAT");
  const [taxRate, setTaxRate] = useState<string>(
    initial?.taxRate?.toString?.() || ""
  );
  const [barcodeFeatureEntitled, setBarcodeFeatureEntitled] = useState<boolean>(
    Boolean(initial?.barcodeFeatureEntitled ?? false)
  );
  const [barcodeScanEnabled, setBarcodeScanEnabled] = useState<boolean>(
    Boolean(initial?.barcodeScanEnabled ?? false)
  );
  const [smsSummaryEntitled, setSmsSummaryEntitled] = useState<boolean>(
    Boolean(initial?.smsSummaryEntitled ?? false)
  );
  const [smsSummaryEnabled, setSmsSummaryEnabled] = useState<boolean>(
    Boolean(initial?.smsSummaryEnabled ?? false)
  );
  const [inventoryFeatureEntitled, setInventoryFeatureEntitled] = useState<boolean>(
    Boolean(initial?.inventoryFeatureEntitled ?? false)
  );
  const [inventoryEnabled, setInventoryEnabled] = useState<boolean>(
    Boolean(initial?.inventoryEnabled ?? false)
  );
  const [cogsFeatureEntitled, setCogsFeatureEntitled] = useState<boolean>(
    Boolean(initial?.cogsFeatureEntitled ?? false)
  );
  const [cogsEnabled, setCogsEnabled] = useState<boolean>(
    Boolean(initial?.cogsEnabled ?? false)
  );
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const hasOwnerOptions = Boolean(ownerOptions && ownerOptions.length > 0);
  const cacheKey = useMemo(
    () => `cachedShops:${cacheUserId || "anon"}`,
    [cacheUserId]
  );

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? safeLocalStorageGet(SHOP_TEMPLATE_KEY) : null;
    let cancelled = false;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ShopTemplate[];
        scheduleStateUpdate(() => {
          if (cancelled) return;
          setTemplates(parsed);
        });
      } catch {
        scheduleStateUpdate(() => {
          if (cancelled) return;
          setTemplates([]);
        });
      }
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const SpeechRecognitionImpl = getSpeechRecognitionCtor();
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setVoiceReady(Boolean(SpeechRecognitionImpl));
    });
    return () => {
      cancelled = true;
      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
      recognitionRef.current?.stop?.();
    };
  }, []);

  useEffect(() => {
    if (!ownerOptions) return;
    let cancelled = false;
    if (ownerOptions.length === 0) {
      scheduleStateUpdate(() => {
        if (cancelled) return;
        setSelectedOwnerId("");
      });
      return () => {
        cancelled = true;
      };
    }
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setSelectedOwnerId((prev) => prev || ownerOptions[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, [ownerOptions]);

  useEffect(() => {
    setFeatureAccessRequests((prev) =>
      prev === featureAccessRequestByKey ? prev : featureAccessRequestByKey
    );
  }, [featureAccessRequestByKey]);

  const frequentTemplates = useMemo(
    () => templates.slice().sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed),
    [templates]
  );

  const recentTemplates = useMemo(
    () => templates.slice().sort((a, b) => b.lastUsed - a.lastUsed),
    [templates]
  );

  const smartNameSuggestions = useMemo(() => {
    const top = frequentTemplates.slice(0, 6).map((t) => t.name);
    const latest = recentTemplates.slice(0, 6).map((t) => t.name);
    return dedupe([...top, ...latest]).slice(0, 8);
  }, [frequentTemplates, recentTemplates]);

  const businessUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    templates.forEach((t) => {
      counts[t.businessType] = (counts[t.businessType] ?? 0) + t.count;
    });
    return counts;
  }, [templates]);

  const sortedBusinessOptions = useMemo(() => {
    return availableBusinessTypes
      .slice()
      .sort((a, b) => (businessUsage[b.id] ?? 0) - (businessUsage[a.id] ?? 0));
  }, [availableBusinessTypes, businessUsage]);

  const voiceErrorText = voiceError ? `(${voiceError})` : "";
  const isListeningName = listeningField === "name";
  const isListeningAddress = listeningField === "address";
  const isListeningPhone = listeningField === "phone";

  const nameVoiceHint = isListeningName
    ? "শুনছি... দোকানের নাম বলুন"
    : voiceReady
    ? "ভয়েসে নাম বললে অটো পূরণ হবে"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const addressVoiceHint = isListeningAddress
    ? "শুনছি... ঠিকানা বলুন"
    : voiceReady
    ? "ভয়েসে ঠিকানা বলুন"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const phoneVoiceHint = isListeningPhone
    ? "শুনছি... ফোন নম্বর বলুন"
    : voiceReady
    ? "ভয়েসে নম্বর বলুন"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";

  const featureSetupSections = useMemo(
    () => [
      {
        ...FEATURE_SECTION_META[0],
        show: Boolean(showSalesInvoiceSettings),
        entitled: Boolean(salesInvoiceEntitled),
        canEdit: Boolean(canEditSalesInvoiceEntitlement),
      },
      {
        ...FEATURE_SECTION_META[1],
        show: Boolean(showQueueTokenSettings),
        entitled: Boolean(queueTokenEntitled),
        canEdit: Boolean(canEditQueueTokenEntitlement),
      },
      {
        ...FEATURE_SECTION_META[2],
        show: Boolean(showDiscountSettings),
        entitled: Boolean(discountFeatureEntitled),
        canEdit: Boolean(canEditDiscountEntitlement),
      },
      {
        ...FEATURE_SECTION_META[3],
        show: Boolean(showTaxSettings),
        entitled: Boolean(taxFeatureEntitled),
        canEdit: Boolean(canEditTaxEntitlement),
      },
      {
        ...FEATURE_SECTION_META[4],
        show: Boolean(showBarcodeSettings),
        entitled: Boolean(barcodeFeatureEntitled),
        canEdit: Boolean(canEditBarcodeEntitlement),
      },
      {
        ...FEATURE_SECTION_META[5],
        show: Boolean(showInventorySettings),
        entitled: Boolean(inventoryFeatureEntitled),
        canEdit: Boolean(canEditInventoryEntitlement),
      },
      {
        ...FEATURE_SECTION_META[6],
        show: Boolean(showCogsSettings),
        entitled: Boolean(cogsFeatureEntitled),
        canEdit: Boolean(canEditCogsEntitlement),
      },
      {
        ...FEATURE_SECTION_META[7],
        show: Boolean(showSmsSummarySettings),
        entitled: Boolean(smsSummaryEntitled),
        canEdit: Boolean(canEditSmsSummaryEntitlement),
      },
    ],
    [
      showSalesInvoiceSettings,
      salesInvoiceEntitled,
      canEditSalesInvoiceEntitlement,
      showQueueTokenSettings,
      queueTokenEntitled,
      canEditQueueTokenEntitlement,
      showDiscountSettings,
      discountFeatureEntitled,
      canEditDiscountEntitlement,
      showTaxSettings,
      taxFeatureEntitled,
      canEditTaxEntitlement,
      showBarcodeSettings,
      barcodeFeatureEntitled,
      canEditBarcodeEntitlement,
      showInventorySettings,
      inventoryFeatureEntitled,
      canEditInventoryEntitlement,
      showCogsSettings,
      cogsFeatureEntitled,
      canEditCogsEntitlement,
      showSmsSummarySettings,
      smsSummaryEntitled,
      canEditSmsSummaryEntitlement,
    ]
  );

  const visibleFeatureSections = useMemo(
    () => featureSetupSections.filter((section) => section.show),
    [featureSetupSections]
  );

  const requestableFeatureSections = useMemo(
    () => visibleFeatureSections.filter((section) => !section.canEdit && !section.entitled),
    [visibleFeatureSections]
  );

  const featureRequestOverview = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    visibleFeatureSections.forEach((section) => {
      const status = featureAccessRequests[section.key]?.status;
      if (status === "approved") approved += 1;
      else if (status === "rejected") rejected += 1;
      else if (status === "pending") pending += 1;
    });
    return { pending, approved, rejected };
  }, [visibleFeatureSections, featureAccessRequests]);

  function persistTemplates(next: ShopTemplate[]) {
    setTemplates(next);
    safeLocalStorageSet(SHOP_TEMPLATE_KEY, JSON.stringify(next));
  }

  function updateCachedShops(
    updater: (prev: Array<Record<string, any>>) => Array<Record<string, any>>
  ) {
    if (typeof window === "undefined") return;
    try {
      const raw = safeLocalStorageGet(cacheKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const base = Array.isArray(parsed) ? parsed : [];
      const next = updater(base);
      safeLocalStorageSet(cacheKey, JSON.stringify(next));
    } catch {
      // ignore cache errors
    }
  }

  async function updatePendingCreate(clientId: string, data: Record<string, any>) {
    try {
      const items = await db.queue.where("type").equals("admin").toArray();
      const matches = items.filter(
        (item) =>
          item.payload?.action === "shop_create" &&
          item.payload?.data?.clientId === clientId
      );
      await Promise.all(
        matches.map((item) =>
          item.id
            ? db.queue.update(item.id, {
                payload: {
                  ...item.payload,
                  data: { ...item.payload.data, ...data },
                },
              })
            : Promise.resolve()
        )
      );
    } catch (err) {
      handlePermissionError(err);
      console.error("Update pending shop create failed", err);
    }
  }

  function applyTemplate(t: ShopTemplate) {
    setName(t.name);
    setAddress(t.address || "");
    setPhone(t.phone || "");
    setBusinessType(t.businessType || "tea_stall");
  }

  function formatRequestDateTime(iso: string | null | undefined) {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("bn-BD", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function getRequestStatusLabel(status: FeatureAccessRequestStatus | undefined) {
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    return "Pending";
  }

  function getRequestStatusClass(status: FeatureAccessRequestStatus | undefined) {
    if (status === "approved") return "text-success";
    if (status === "rejected") return "text-danger";
    return "text-warning";
  }

  async function handleFeatureAccessRequest(featureKey: FeatureAccessKey) {
    if (!shopId) {
      return;
    }
    setFeatureRequestBusyKey(featureKey);
    setFeatureRequestMessageByKey((prev) => ({ ...prev, [featureKey]: "" }));
    try {
      const result = await requestFeatureAccess({
        shopId,
        featureKey,
        reason: featureRequestReasonByKey[featureKey] || "",
      });
      if (result.request) {
        setFeatureAccessRequests((prev) => ({
          ...prev,
          [featureKey]: result.request,
        }));
      }
      setFeatureRequestMessageByKey((prev) => ({
        ...prev,
        [featureKey]:
          result.status === "already_enabled"
            ? "এই ফিচারের entitlement আগে থেকেই চালু আছে।"
            : "রিকোয়েস্ট পাঠানো হয়েছে। Super Admin review করলে enable হবে।",
      }));
      setFeatureRequestReasonByKey((prev) => ({ ...prev, [featureKey]: "" }));
    } catch (err) {
      handlePermissionError(err);
      setFeatureRequestMessageByKey((prev) => ({
        ...prev,
        [featureKey]:
          err instanceof Error
            ? err.message
            : "রিকোয়েস্ট পাঠানো যায়নি। আবার চেষ্টা করুন।",
      }));
    } finally {
      setFeatureRequestBusyKey(null);
    }
  }

  function startVoice(field: "name" | "address" | "phone") {
    if (listeningField === field) return;
    if (listeningField) stopVoice();
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = startDualLanguageVoice({
      onRecognitionRef: (recognition) => {
        recognitionRef.current = recognition;
      },
      onTranscript: (spoken) => {
        if (field === "name") {
          const parsed = parseSpokenNameAndPhone(spoken);
          if (parsed.name) setName(parsed.name);
          if (parsed.phone) setPhone(parsed.phone);
          return;
        }
        if (field === "address") {
          setAddress(spoken);
          return;
        }
        const parsedPhone = parsePhone(spoken);
        if (parsedPhone) setPhone(parsedPhone);
      },
      onError: (kind) => {
        if (kind === "aborted") return;
        if (kind === "not_supported") setVoiceReady(false);
        setVoiceError(mapVoiceErrorBangla(kind));
      },
      onEnd: () => {
        setListeningField(null);
        voiceSessionRef.current = null;
      },
    });
    if (!voiceSessionRef.current) return;
    setVoiceError(null);
    setListeningField(field);
  }

  function stopVoice() {
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    recognitionRef.current?.stop?.();
    setListeningField(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitError(null);

    if (ownerOptions && !hasOwnerOptions) {
      setSubmitError("কোনো owner পাওয়া যায়নি");
      return;
    }

    if (ownerOptions && !selectedOwnerId) {
      setSubmitError("Owner নির্বাচন করতে হবে");
      return;
    }

    const payloadName = ((form.get("name") as string) || name).trim();
    const payloadAddress = ((form.get("address") as string) || address).trim();
    const payloadPhone = ((form.get("phone") as string) || phone).trim();
    const payloadBusinessType = (form.get("businessType") as string) || businessType;
    const payloadSalesInvoiceEntitled = Boolean(salesInvoiceEntitled);
    const payloadSalesInvoiceEnabled = payloadSalesInvoiceEntitled
      ? Boolean(salesInvoiceEnabled)
      : false;
    const payloadSalesInvoicePrefix = salesInvoicePrefix
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);
    const payloadSalesInvoicePrintSize = sanitizeSalesInvoicePrintSize(
      salesInvoicePrintSize
    );
    const payloadQueueTokenEntitled = Boolean(queueTokenEntitled);
    const payloadQueueTokenEnabled = payloadQueueTokenEntitled
      ? Boolean(queueTokenEnabled)
      : false;
    const payloadQueueTokenPrefix = queueTokenPrefix
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);
    const payloadQueueWorkflow = (queueWorkflow || "").trim().toLowerCase();
    const payloadDiscountFeatureEntitled = Boolean(discountFeatureEntitled);
    const payloadDiscountEnabled = payloadDiscountFeatureEntitled
      ? Boolean(discountEnabled)
      : false;
    const payloadTaxFeatureEntitled = Boolean(taxFeatureEntitled);
    const payloadTaxEnabled = payloadTaxFeatureEntitled ? Boolean(taxEnabled) : false;
    const payloadTaxLabel = (taxLabel || "").trim().slice(0, 24) || "VAT";
    const payloadTaxRateNum = Number(taxRate || 0);
    const payloadTaxRate =
      Number.isFinite(payloadTaxRateNum) && payloadTaxRateNum > 0
        ? Math.min(payloadTaxRateNum, 100).toFixed(2)
        : "0.00";
    const payloadBarcodeFeatureEntitled = Boolean(barcodeFeatureEntitled);
    const payloadBarcodeScanEnabled = payloadBarcodeFeatureEntitled
      ? Boolean(barcodeScanEnabled)
      : false;
    const payloadSmsSummaryEntitled = Boolean(smsSummaryEntitled);
    const payloadSmsSummaryEnabled = payloadSmsSummaryEntitled
      ? Boolean(smsSummaryEnabled)
      : false;
    const payloadInventoryFeatureEntitled = Boolean(inventoryFeatureEntitled);
    const payloadInventoryEnabled = payloadInventoryFeatureEntitled
      ? Boolean(inventoryEnabled)
      : false;
    const payloadCogsFeatureEntitled = Boolean(cogsFeatureEntitled);
    const payloadCogsEnabled =
      payloadCogsFeatureEntitled && payloadInventoryEnabled
        ? Boolean(cogsEnabled)
        : false;

    form.set("name", payloadName);
    form.set("address", payloadAddress);
    form.set("phone", payloadPhone);
    form.set("businessType", payloadBusinessType);
    if (showSalesInvoiceSettings) {
      if (canEditSalesInvoiceEntitlement) {
        form.set(
          "salesInvoiceEntitled",
          payloadSalesInvoiceEntitled ? "1" : "0"
        );
      }
      form.set("salesInvoiceEnabled", payloadSalesInvoiceEnabled ? "1" : "0");
      form.set("salesInvoicePrefix", payloadSalesInvoicePrefix);
      form.set("salesInvoicePrintSize", payloadSalesInvoicePrintSize);
    }
    if (showQueueTokenSettings) {
      if (canEditQueueTokenEntitlement) {
        form.set("queueTokenEntitled", payloadQueueTokenEntitled ? "1" : "0");
      }
      form.set("queueTokenEnabled", payloadQueueTokenEnabled ? "1" : "0");
      form.set("queueTokenPrefix", payloadQueueTokenPrefix);
      form.set("queueWorkflow", payloadQueueWorkflow);
    }
    if (showDiscountSettings) {
      if (canEditDiscountEntitlement) {
        form.set(
          "discountFeatureEntitled",
          payloadDiscountFeatureEntitled ? "1" : "0"
        );
      }
      form.set("discountEnabled", payloadDiscountEnabled ? "1" : "0");
    }
    if (showTaxSettings) {
      if (canEditTaxEntitlement) {
        form.set("taxFeatureEntitled", payloadTaxFeatureEntitled ? "1" : "0");
      }
      form.set("taxEnabled", payloadTaxEnabled ? "1" : "0");
      form.set("taxLabel", payloadTaxLabel);
      form.set("taxRate", payloadTaxRate);
    }
    if (showBarcodeSettings) {
      if (canEditBarcodeEntitlement) {
        form.set(
          "barcodeFeatureEntitled",
          payloadBarcodeFeatureEntitled ? "1" : "0"
        );
      }
      form.set("barcodeScanEnabled", payloadBarcodeScanEnabled ? "1" : "0");
    }
    if (showSmsSummarySettings) {
      if (canEditSmsSummaryEntitlement) {
        form.set(
          "smsSummaryEntitled",
          payloadSmsSummaryEntitled ? "1" : "0"
        );
      }
      form.set("smsSummaryEnabled", payloadSmsSummaryEnabled ? "1" : "0");
    }
    if (showInventorySettings) {
      if (canEditInventoryEntitlement) {
        form.set(
          "inventoryFeatureEntitled",
          payloadInventoryFeatureEntitled ? "1" : "0"
        );
      }
      form.set("inventoryEnabled", payloadInventoryEnabled ? "1" : "0");
    }
    if (showCogsSettings) {
      if (canEditCogsEntitlement) {
        form.set(
          "cogsFeatureEntitled",
          payloadCogsFeatureEntitled ? "1" : "0"
        );
      }
      form.set("cogsEnabled", payloadCogsEnabled ? "1" : "0");
    }
    if (ownerOptions) {
      form.set("ownerId", selectedOwnerId);
    }

    const template: ShopTemplate = {
      name: payloadName,
      address: payloadAddress,
      phone: payloadPhone,
      businessType: payloadBusinessType,
      count: 1,
      lastUsed: Date.now(),
    };
    persistTemplates(mergeTemplates(templates, template));

    try {
      if (!online) {
        const payload = {
          name: payloadName,
          address: payloadAddress || null,
          phone: payloadPhone || null,
          businessType: payloadBusinessType,
          ...(showSalesInvoiceSettings
            ? {
                ...(canEditSalesInvoiceEntitlement
                  ? { salesInvoiceEntitled: payloadSalesInvoiceEntitled }
                  : {}),
                salesInvoiceEnabled: payloadSalesInvoiceEnabled,
                salesInvoicePrefix: payloadSalesInvoicePrefix || null,
                salesInvoicePrintSize: payloadSalesInvoicePrintSize,
              }
            : {}),
          ...(showQueueTokenSettings
            ? {
                ...(canEditQueueTokenEntitlement
                  ? { queueTokenEntitled: payloadQueueTokenEntitled }
                  : {}),
                queueTokenEnabled: payloadQueueTokenEnabled,
                queueTokenPrefix: payloadQueueTokenPrefix || null,
                queueWorkflow: payloadQueueWorkflow || null,
              }
            : {}),
          ...(showDiscountSettings
            ? {
                ...(canEditDiscountEntitlement
                  ? { discountFeatureEntitled: payloadDiscountFeatureEntitled }
                  : {}),
                discountEnabled: payloadDiscountEnabled,
              }
            : {}),
          ...(showTaxSettings
            ? {
                ...(canEditTaxEntitlement
                  ? { taxFeatureEntitled: payloadTaxFeatureEntitled }
                  : {}),
                taxEnabled: payloadTaxEnabled,
                taxLabel: payloadTaxLabel,
                taxRate: payloadTaxRate,
              }
            : {}),
          ...(showBarcodeSettings
            ? {
                ...(canEditBarcodeEntitlement
                  ? { barcodeFeatureEntitled: payloadBarcodeFeatureEntitled }
                  : {}),
                barcodeScanEnabled: payloadBarcodeScanEnabled,
              }
            : {}),
          ...(showSmsSummarySettings
            ? {
                ...(canEditSmsSummaryEntitlement
                  ? { smsSummaryEntitled: payloadSmsSummaryEntitled }
                  : {}),
                smsSummaryEnabled: payloadSmsSummaryEnabled,
              }
            : {}),
          ...(showInventorySettings
            ? {
                ...(canEditInventoryEntitlement
                  ? { inventoryFeatureEntitled: payloadInventoryFeatureEntitled }
                  : {}),
                inventoryEnabled: payloadInventoryEnabled,
              }
            : {}),
          ...(showCogsSettings
            ? {
                ...(canEditCogsEntitlement
                  ? { cogsFeatureEntitled: payloadCogsFeatureEntitled }
                  : {}),
                cogsEnabled: payloadCogsEnabled,
              }
            : {}),
          ownerId: ownerOptions ? selectedOwnerId || null : null,
        };

        if (shopId) {
          if (shopId.startsWith("offline-")) {
            await updatePendingCreate(shopId, payload);
          } else {
            await queueAdminAction("shop_update", { id: shopId, ...payload });
          }
          updateCachedShops((prev) =>
            prev.map((shop) =>
              shop.id === shopId
                ? { ...shop, ...payload, pending: true }
                : shop
            )
          );
          alert("অফলাইন: দোকানের পরিবর্তন কিউ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
          router.push(backHref);
          return;
        }

        const clientId = `offline-${crypto.randomUUID()}`;
        await queueAdminAction("shop_create", { ...payload, clientId });
        updateCachedShops((prev) => [
          {
            id: clientId,
            name: payloadName,
            address: payloadAddress,
            phone: payloadPhone,
            pending: true,
          },
          ...prev,
        ]);
        alert("অফলাইন: দোকান তৈরি কিউ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
        router.push(backHref);
        return;
      }

      await action(form);
      router.push(backHref);
    } catch (err) {
      if (isNextRedirectError(err)) {
        throw err;
      }
      handlePermissionError(err);
      setSubmitError(
        err instanceof Error ? err.message : "Shop তৈরি করতে ব্যর্থ"
      );
    }
  }

  function renderFeatureAccessRequestCard(
    featureKey: FeatureAccessKey,
    entitlementEnabled: boolean,
    canEditEntitlement: boolean
  ) {
    if (!shopId || canEditEntitlement || entitlementEnabled) return null;
    const featureMeta = FEATURE_ACCESS_META[featureKey];
    const requestSnapshot = featureAccessRequests[featureKey];
    const status = requestSnapshot?.status;
    const createdAtLabel = formatRequestDateTime(requestSnapshot?.createdAtIso);
    const decidedAtLabel = formatRequestDateTime(requestSnapshot?.decidedAtIso);
    const message = featureRequestMessageByKey[featureKey];
    const reasonInput = featureRequestReasonByKey[featureKey] || "";
    const isPending = status === "pending";

    return (
      <div className="rounded-xl border border-primary/20 bg-primary-soft/50 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          এই ফিচার চালু করতে Super Admin approval লাগবে।
        </p>
        {requestSnapshot ? (
          <div className="rounded-lg border border-border bg-card px-3 py-2 space-y-1">
            <p className="text-xs text-muted-foreground">
              সর্বশেষ রিকোয়েস্ট:{" "}
              <span className={`font-semibold ${getRequestStatusClass(status)}`}>
                {getRequestStatusLabel(status)}
              </span>
            </p>
            {createdAtLabel ? (
              <p className="text-xs text-muted-foreground">
                Requested: {createdAtLabel}
              </p>
            ) : null}
            {decidedAtLabel && status !== "pending" ? (
              <p className="text-xs text-muted-foreground">
                Reviewed: {decidedAtLabel}
              </p>
            ) : null}
            {requestSnapshot.decisionNote ? (
              <p className="text-xs text-muted-foreground">
                Admin note: {requestSnapshot.decisionNote}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <textarea
            value={reasonInput}
            onChange={(e) =>
              setFeatureRequestReasonByKey((prev) => ({
                ...prev,
                [featureKey]: e.target.value.slice(0, 500),
              }))
            }
            className="w-full min-h-[76px] rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
            placeholder={`${featureMeta.banglaTitle} ফিচার কেন দরকার, সংক্ষেপে লিখুন (ঐচ্ছিক)`}
          />
          <button
            type="button"
            onClick={() => handleFeatureAccessRequest(featureKey)}
            disabled={featureRequestBusyKey === featureKey || isPending}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-primary/40 bg-card px-3 text-sm font-semibold text-primary hover:bg-primary-soft disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? "রিকোয়েস্ট পেন্ডিং" : `${featureMeta.title} Request Access`}
          </button>
          {message ? (
            <p className="text-xs text-primary font-medium">{message}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4 shadow-sm">
      {ownerOptions ? (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-foreground">মালিক নির্বাচন করুন *</label>
          <select
            name="ownerId"
            value={selectedOwnerId}
            onChange={(e) => setSelectedOwnerId(e.target.value)}
            className="w-full h-11 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            required
          >
            {ownerOptions.length === 0 ? (
              <option value="">কোনো মালিক পাওয়া যায়নি</option>
            ) : (
              ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name || owner.email || "Unknown owner"}
                </option>
              ))
            )}
          </select>
          <p className="text-sm text-muted-foreground">এই দোকানটি কোন মালিকের অধীনে হবে তা নির্বাচন করুন</p>
        </div>
      ) : null}

      {/* Shop Name */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">দোকানের নাম *</label>
        <div className="relative">
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-12 rounded-xl border border-border bg-card px-4 pr-16 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="যেমন: নিউ মদিনা স্টোর"
            required
            autoComplete="off"
          />
          <button
            type="button"
            onClick={isListeningName ? stopVoice : () => startVoice("name")}
            disabled={!voiceReady}
            aria-label={isListeningName ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
            className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
              isListeningName
                ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                : "bg-primary-soft text-primary border-primary/30 active:scale-95"
            } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {isListeningName ? "🔴" : "🎤"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {nameVoiceHint}{" "}
          {voiceErrorText ? <span className="text-danger">{voiceErrorText}</span> : null}
        </p>
        {smartNameSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {smartNameSuggestions.map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => {
                  const found = templates.find((t) => t.name === title);
                  if (found) applyTemplate(found);
                  else setName(title);
                }}
                className="h-9 px-3 rounded-full border border-primary/30 text-primary bg-primary-soft text-xs font-semibold hover:border-primary/50"
              >
                {title}
              </button>
            ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground">বলুন: “মদিনা স্টোর 017xxxxxxx” → নাম + ফোন</p>
      </div>

      {/* Address */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">ঠিকানা (ঐচ্ছিক)</label>
        <div className="relative">
          <input
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full h-12 rounded-xl border border-border bg-card px-4 pr-16 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="যেমন: ১২/বি প্রধান সড়ক, ঢাকা"
          />
          <button
            type="button"
            onClick={isListeningAddress ? stopVoice : () => startVoice("address")}
            disabled={!voiceReady}
            aria-label={isListeningAddress ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
            className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
              isListeningAddress
                ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                : "bg-primary-soft text-primary border-primary/30 active:scale-95"
            } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {isListeningAddress ? "🔴" : "🎤"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {addressVoiceHint}{" "}
          {voiceErrorText ? <span className="text-danger">{voiceErrorText}</span> : null}
        </p>
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">মোবাইল নাম্বার (ঐচ্ছিক)</label>
        <div className="relative">
          <input
            name="phone"
            value={phone}
            onChange={(e) => setPhone(parsePhone(e.target.value))}
            className="w-full h-11 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="যেমন: 01700000000"
          />
          <button
            type="button"
            onClick={isListeningPhone ? stopVoice : () => startVoice("phone")}
            disabled={!voiceReady}
            aria-label={isListeningPhone ? "ভয়েস বন্ধ করুন" : "ভয়েস ইনপুট চালু করুন"}
            className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
              isListeningPhone
                ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                : "bg-primary-soft text-primary border-primary/30 active:scale-95"
            } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {isListeningPhone ? "🔴" : "🎤"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {phoneVoiceHint}{" "}
          {voiceErrorText ? <span className="text-danger">{voiceErrorText}</span> : null}
        </p>
        <p className="text-sm text-muted-foreground">সংখ্যা বললে/পেস্ট করলে অটো ক্লিন হবে</p>
      </div>

      {/* Business Type */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-foreground">ব্যবসার ধরন</label>
        <div className="flex flex-wrap gap-2">
          {sortedBusinessOptions.slice(0, 6).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBusinessType(b.id)}
              className={`px-3 py-2 rounded-full border text-sm ${
                businessType === b.id
                  ? "bg-primary-soft border-primary/50 text-primary"
                  : "bg-card border-border text-foreground hover:border-primary/30"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <select
          name="businessType"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          className="w-full h-11 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          required
        >
          {availableBusinessTypes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">সর্বশেষ ব্যবহারকৃত টাইপগুলো উপরে দেখাচ্ছে</p>
      </div>

      {shopId && visibleFeatureSections.length > 0 ? (
        <div className="rounded-2xl border border-primary/20 bg-primary-soft/35 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Feature Access Center</p>
              <p className="text-xs text-muted-foreground">
                যেসব ফিচার locked, সেগুলোতে দ্রুত request পাঠান।
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-card px-2.5 py-1 text-xs font-semibold text-primary">
              Total: {visibleFeatureSections.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pending</p>
              <p className="text-sm font-semibold text-warning">{featureRequestOverview.pending}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Approved</p>
              <p className="text-sm font-semibold text-success">{featureRequestOverview.approved}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rejected</p>
              <p className="text-sm font-semibold text-danger">{featureRequestOverview.rejected}</p>
            </div>
          </div>
          {requestableFeatureSections.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Quick access: নিচের feature-এ tap করলে সরাসরি সেই section-এ যাবে।
              </p>
              <div className="flex flex-wrap gap-2">
                {requestableFeatureSections.map((section) => {
                  const status = featureAccessRequests[section.key]?.status;
                  return (
                    <a
                      key={section.key}
                      href={`#${section.anchorId}`}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft"
                    >
                      {section.title}
                      {status === "pending" ? (
                        <span className="text-warning">• pending</span>
                      ) : null}
                    </a>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-xs font-semibold text-success">
              সব visible feature entitlement ready আছে।
            </p>
          )}
        </div>
      ) : null}

      {showSalesInvoiceSettings ? (
        <details id="feature-sales-invoice" className="group scroll-mt-28 rounded-2xl border border-border bg-muted/40 p-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div className="space-y-1">
              <p className="block text-sm font-semibold text-foreground">
                বিক্রির ইনভয়েস ফিচার
              </p>
              <p className="text-xs text-muted-foreground">
                এই দোকানে ফিচার চালু থাকলে এবং ইউজারের পারমিশন থাকলে sales invoice issue হবে।
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${salesInvoiceEntitled ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning"}`}>
              {salesInvoiceEntitled ? "Enabled" : "Locked"}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={salesInvoiceEntitled}
              onChange={(e) => {
                const next = e.target.checked;
                setSalesInvoiceEntitled(next);
                if (!next) {
                  setSalesInvoiceEnabled(false);
                }
              }}
              disabled={!canEditSalesInvoiceEntitlement}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            এই দোকানে Sales Invoice entitlement চালু
          </label>
          {!canEditSalesInvoiceEntitlement ? (
            <p className="text-xs text-muted-foreground">
              এই entitlement শুধু super-admin পরিবর্তন করতে পারবেন।
            </p>
          ) : null}
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={salesInvoiceEnabled}
              onChange={(e) => setSalesInvoiceEnabled(e.target.checked)}
              disabled={!salesInvoiceEntitled}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
            />
            এই দোকানে Sales Invoice চালু
          </label>
          {!salesInvoiceEntitled ? (
            <p className="text-xs text-warning">
              প্রথমে entitlement চালু না হলে Sales Invoice toggle activate হবে না।
            </p>
          ) : null}
          {renderFeatureAccessRequestCard(
            "sales_invoice",
            salesInvoiceEntitled,
            canEditSalesInvoiceEntitlement
          )}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              ইনভয়েস প্রিফিক্স
            </label>
            <input
              value={salesInvoicePrefix}
              onChange={(e) =>
                setSalesInvoicePrefix(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)
                )
              }
              className="w-full h-11 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="INV"
              maxLength={12}
              disabled={!salesInvoiceEnabled}
            />
            <p className="text-xs text-muted-foreground">
              উদাহরণ: `INV` হলে নম্বর হবে `INV-YYMM-000001`
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              প্রিন্ট সাইজ
            </label>
            <select
              value={salesInvoicePrintSize}
              onChange={(e) => setSalesInvoicePrintSize(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              disabled={!salesInvoiceEnabled}
            >
              {SALES_INVOICE_PRINT_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {
                SALES_INVOICE_PRINT_SIZE_OPTIONS.find(
                  (option) => option.value === salesInvoicePrintSize
                )?.hint
              }
            </p>
          </div>
          </div>
        </details>
      ) : null}

      {showQueueTokenSettings ? (
        <details id="feature-queue-token" className="group scroll-mt-28 rounded-2xl border border-border bg-muted/40 p-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div className="space-y-1">
              <p className="block text-sm font-semibold text-foreground">
                Queue টোকেন ফিচার
              </p>
              <p className="text-xs text-muted-foreground">
                চালু থাকলে queue board থেকে serial token issue করা যাবে।
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${queueTokenEntitled ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning"}`}>
              {queueTokenEntitled ? "Enabled" : "Locked"}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={queueTokenEntitled}
              onChange={(e) => {
                const next = e.target.checked;
                setQueueTokenEntitled(next);
                if (!next) {
                  setQueueTokenEnabled(false);
                }
              }}
              disabled={!canEditQueueTokenEntitlement}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            এই দোকানে Queue Token entitlement চালু
          </label>
          {!canEditQueueTokenEntitlement ? (
            <p className="text-xs text-muted-foreground">
              এই entitlement শুধু super-admin পরিবর্তন করতে পারবেন।
            </p>
          ) : null}
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={queueTokenEnabled}
              onChange={(e) => setQueueTokenEnabled(e.target.checked)}
              disabled={!queueTokenEntitled}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
            />
            এই দোকানে Queue Token চালু
          </label>
          {!queueTokenEntitled ? (
            <p className="text-xs text-warning">
              প্রথমে entitlement চালু না হলে Queue Token toggle activate হবে না।
            </p>
          ) : null}
          {renderFeatureAccessRequestCard(
            "queue_token",
            queueTokenEntitled,
            canEditQueueTokenEntitlement
          )}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              টোকেন প্রিফিক্স
            </label>
            <input
              value={queueTokenPrefix}
              onChange={(e) =>
                setQueueTokenPrefix(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)
                )
              }
              className="w-full h-11 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="TK"
              maxLength={12}
              disabled={!queueTokenEnabled}
            />
            <p className="text-xs text-muted-foreground">
              উদাহরণ: `TK` হলে টোকেন হবে `TK-0001`
            </p>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              টোকেন ওয়ার্কফ্লো প্রোফাইল
            </label>
            <select
              value={queueWorkflow}
              onChange={(e) => setQueueWorkflow(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              disabled={!queueTokenEnabled}
            >
              <option value="">Auto (Business Type থেকে)</option>
              <option value="restaurant">Restaurant</option>
              <option value="salon">Salon</option>
              <option value="generic">Generic</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Auto দিলে ব্যবসার ধরন দেখে status label/flow ঠিক হবে।
            </p>
          </div>
          </div>
        </details>
      ) : null}

      {showDiscountSettings ? (
        <details id="feature-discount" className="group scroll-mt-28 rounded-2xl border border-border bg-muted/40 p-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div className="space-y-1">
              <p className="block text-sm font-semibold text-foreground">
                Sale Discount ফিচার
              </p>
              <p className="text-xs text-muted-foreground">
                Super-admin entitlement + owner toggle true হলে POS-এ sale-level discount দেখা যাবে।
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${discountFeatureEntitled ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning"}`}>
              {discountFeatureEntitled ? "Enabled" : "Locked"}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/70 pt-3">

          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={discountFeatureEntitled}
              onChange={(e) => {
                const next = e.target.checked;
                setDiscountFeatureEntitled(next);
                if (!next) {
                  setDiscountEnabled(false);
                }
              }}
              disabled={!canEditDiscountEntitlement}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            এই দোকানে Discount entitlement চালু
          </label>
          {!canEditDiscountEntitlement ? (
            <p className="text-xs text-muted-foreground">
              এই entitlement শুধু super-admin পরিবর্তন করতে পারবেন।
            </p>
          ) : null}

          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={discountEnabled}
              onChange={(e) => setDiscountEnabled(e.target.checked)}
              disabled={!discountFeatureEntitled}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            POS-এ sale discount চালু
          </label>
          {!discountFeatureEntitled ? (
            <p className="text-xs text-warning">
              প্রথমে entitlement চালু না হলে discount toggle activate হবে না।
            </p>
          ) : null}
          {renderFeatureAccessRequestCard(
            "discount",
            discountFeatureEntitled,
            canEditDiscountEntitlement
          )}
          </div>
        </details>
      ) : null}

      {showTaxSettings ? (
        <details id="feature-tax" className="group scroll-mt-28 rounded-2xl border border-border bg-muted/40 p-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div className="space-y-1">
              <p className="block text-sm font-semibold text-foreground">
                VAT / Tax ফিচার
              </p>
              <p className="text-xs text-muted-foreground">
                Super-admin entitlement + owner toggle true হলে sale, invoice, report-এ
                per-shop exclusive VAT/Tax apply হবে।
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${taxFeatureEntitled ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning"}`}>
              {taxFeatureEntitled ? "Enabled" : "Locked"}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/70 pt-3">

          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={taxFeatureEntitled}
              onChange={(e) => {
                const next = e.target.checked;
                setTaxFeatureEntitled(next);
                if (!next) {
                  setTaxEnabled(false);
                }
              }}
              disabled={!canEditTaxEntitlement}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            এই দোকানে VAT/Tax entitlement চালু
          </label>
          {!canEditTaxEntitlement ? (
            <p className="text-xs text-muted-foreground">
              এই entitlement শুধু super-admin পরিবর্তন করতে পারবেন।
            </p>
          ) : null}

          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={taxEnabled}
              onChange={(e) => setTaxEnabled(e.target.checked)}
              disabled={!taxFeatureEntitled}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            POS-এ VAT/Tax চালু
          </label>
          {!taxFeatureEntitled ? (
            <p className="text-xs text-warning">
              প্রথমে entitlement চালু না হলে VAT/Tax toggle activate হবে না।
            </p>
          ) : null}
          {renderFeatureAccessRequestCard(
            "tax",
            taxFeatureEntitled,
            canEditTaxEntitlement
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-muted-foreground">
                Tax label
              </label>
              <input
                value={taxLabel}
                onChange={(e) => setTaxLabel(e.target.value.slice(0, 24))}
                className="w-full h-11 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="VAT"
                maxLength={24}
                disabled={!taxFeatureEntitled}
              />
              <p className="text-xs text-muted-foreground">
                Invoice-এ যেমন দেখাতে চান: VAT, Tax, Service Tax
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-muted-foreground">
                Rate (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="যেমন 5"
                disabled={!taxFeatureEntitled}
              />
              <p className="text-xs text-muted-foreground">
                Exclusive rate. Discount-এর পর net subtotal-এর উপর apply হবে।
              </p>
            </div>
          </div>
          </div>
        </details>
      ) : null}

      {showBarcodeSettings ? (
        <details id="feature-barcode" className="group scroll-mt-28 rounded-2xl border border-border bg-muted/40 p-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div className="space-y-1">
              <p className="block text-sm font-semibold text-foreground">
                Barcode / SKU Scan ফিচার
              </p>
              <p className="text-xs text-muted-foreground">
                Super-admin entitlement + owner toggle + staff permission একসাথে
                true হলে POS scan দেখাবে।
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${barcodeFeatureEntitled ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning"}`}>
              {barcodeFeatureEntitled ? "Enabled" : "Locked"}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/70 pt-3">

          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={barcodeFeatureEntitled}
              onChange={(e) => {
                const next = e.target.checked;
                setBarcodeFeatureEntitled(next);
                if (!next) {
                  setBarcodeScanEnabled(false);
                }
              }}
              disabled={!canEditBarcodeEntitlement}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            এই দোকানে Barcode entitlement চালু
          </label>
          {!canEditBarcodeEntitlement ? (
            <p className="text-xs text-muted-foreground">
              এই entitlement শুধু super-admin পরিবর্তন করতে পারবেন।
            </p>
          ) : null}

          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={barcodeScanEnabled}
              onChange={(e) => setBarcodeScanEnabled(e.target.checked)}
              disabled={!barcodeFeatureEntitled}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            POS-এ Barcode/SKU scan চালু
          </label>
          {!barcodeFeatureEntitled ? (
            <p className="text-xs text-warning">
              প্রথমে entitlement চালু না হলে scan toggle activate হবে না।
            </p>
          ) : null}
          {renderFeatureAccessRequestCard(
            "barcode",
            barcodeFeatureEntitled,
            canEditBarcodeEntitlement
          )}
          </div>
        </details>
      ) : null}

      {showInventorySettings ? (
        <details id="feature-inventory-cogs" className="group scroll-mt-28 rounded-2xl border border-border bg-muted/40 p-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div className="space-y-1">
              <p className="block text-sm font-semibold text-foreground">
                Purchases + Suppliers ফিচার
              </p>
              <p className="text-xs text-muted-foreground">
                চালু থাকলে Purchase ও Supplier management module unlock হবে।
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${inventoryFeatureEntitled ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning"}`}>
              {inventoryFeatureEntitled ? "Enabled" : "Locked"}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={inventoryFeatureEntitled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setInventoryFeatureEntitled(next);
                  if (!next) {
                    setInventoryEnabled(false);
                  }
                }}
                disabled={!canEditInventoryEntitlement}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
              />
              এই দোকানে Purchases/Suppliers entitlement চালু
            </label>
            {!canEditInventoryEntitlement ? (
              <p className="text-xs text-muted-foreground">
                এই entitlement শুধু super-admin পরিবর্তন করতে পারবেন।
              </p>
            ) : null}

            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={inventoryEnabled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setInventoryEnabled(next);
                  if (!next) {
                    setCogsEnabled(false);
                  }
                }}
                disabled={!inventoryFeatureEntitled}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
              />
              Purchases/Suppliers module চালু
            </label>
            {!inventoryFeatureEntitled ? (
              <p className="text-xs text-warning">
                প্রথমে entitlement চালু না হলে Purchases/Suppliers module activate হবে না।
              </p>
            ) : null}
            {renderFeatureAccessRequestCard(
              "inventory_cogs",
              inventoryFeatureEntitled,
              canEditInventoryEntitlement
            )}
          </div>
        </details>
      ) : null}

      {showCogsSettings ? (
        <details id="feature-cogs-analytics" className="group scroll-mt-28 rounded-2xl border border-border bg-muted/40 p-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div className="space-y-1">
              <p className="block text-sm font-semibold text-foreground">
                COGS Analytics ফিচার
              </p>
              <p className="text-xs text-muted-foreground">
                চালু থাকলে রিপোর্ট/কপাইলটে COGS-ভিত্তিক profit analytics apply হবে।
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cogsFeatureEntitled ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning"}`}>
              {cogsFeatureEntitled ? "Enabled" : "Locked"}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={cogsFeatureEntitled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setCogsFeatureEntitled(next);
                  if (!next) {
                    setCogsEnabled(false);
                  }
                }}
                disabled={!canEditCogsEntitlement}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
              />
              এই দোকানে COGS analytics entitlement চালু
            </label>
            {!canEditCogsEntitlement ? (
              <p className="text-xs text-muted-foreground">
                এই entitlement শুধু super-admin পরিবর্তন করতে পারবেন।
              </p>
            ) : null}

            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={cogsEnabled}
                onChange={(e) => setCogsEnabled(e.target.checked)}
                disabled={!cogsFeatureEntitled || !inventoryEnabled}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
              />
              COGS profit analytics চালু
            </label>
            {!inventoryEnabled ? (
              <p className="text-xs text-warning">
                আগে Purchases/Suppliers module চালু করতে হবে, তারপর COGS analytics চালু হবে।
              </p>
            ) : !cogsFeatureEntitled ? (
              <p className="text-xs text-warning">
                প্রথমে entitlement চালু না হলে COGS analytics activate হবে না।
              </p>
            ) : null}
            {renderFeatureAccessRequestCard(
              "cogs_analytics",
              cogsFeatureEntitled,
              canEditCogsEntitlement
            )}
          </div>
        </details>
      ) : null}

      {showSmsSummarySettings ? (
        <details id="feature-sms-summary" className="group scroll-mt-28 rounded-2xl border border-border bg-muted/40 p-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div className="space-y-1">
              <p className="block text-sm font-semibold text-foreground">
                Daily SMS Summary ফিচার
              </p>
              <p className="text-xs text-muted-foreground">
                Super-admin entitlement + owner toggle true হলে এই দোকানে SMS summary
                চালু করা যাবে।
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${smsSummaryEntitled ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning"}`}>
              {smsSummaryEntitled ? "Enabled" : "Locked"}
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-border/70 pt-3">

          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={smsSummaryEntitled}
              onChange={(e) => {
                const next = e.target.checked;
                setSmsSummaryEntitled(next);
                if (!next) {
                  setSmsSummaryEnabled(false);
                }
              }}
              disabled={!canEditSmsSummaryEntitlement}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            এই দোকানে SMS entitlement চালু
          </label>
          {!canEditSmsSummaryEntitlement ? (
            <p className="text-xs text-muted-foreground">
              এই entitlement শুধু super-admin পরিবর্তন করতে পারবেন।
            </p>
          ) : null}

          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={smsSummaryEnabled}
              onChange={(e) => setSmsSummaryEnabled(e.target.checked)}
              disabled={!smsSummaryEntitled}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 disabled:opacity-60"
            />
            Owner daily SMS summary চালু
          </label>
          {!smsSummaryEntitled ? (
            <p className="text-xs text-warning">
              প্রথমে entitlement চালু না হলে SMS toggle activate হবে না।
            </p>
          ) : null}
          {renderFeatureAccessRequestCard(
            "sms_summary",
            smsSummaryEntitled,
            canEditSmsSummaryEntitlement
          )}
          </div>
        </details>
      ) : null}

      {/* Recent Templates */}
      {recentTemplates.length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary-soft p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-primary">রিসেন্ট দোকান</h3>
            <span className="text-xs text-primary">এক ট্যাপে অটো-ফিল</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentTemplates.slice(0, 4).map((t) => (
              <button
                key={`${t.name}-${t.lastUsed}`}
                type="button"
                onClick={() => applyTemplate(t)}
                className="flex items-center justify-between gap-3 bg-card border border-primary/20 rounded-xl px-3 py-2 text-left hover:border-primary/50 transition-colors"
              >
                <div>
                  <p className="font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.address || "ঠিকানা নেই"} • {t.phone || "ফোন নেই"}
                  </p>
                </div>
                <span className="text-xs text-primary">
                  {availableBusinessTypes.find((b) => b.id === t.businessType)?.label || t.businessType}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {submitError ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {submitError}
        </div>
      ) : null}

      {/* Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          className="flex-1 h-14 sm:h-12 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-primary-foreground border border-primary/40 text-base font-semibold shadow-[0_12px_22px_rgba(22,163,74,0.28)] transition hover:brightness-105 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {submitLabel}
        </button>
        <Link
          href={backHref}
          className="flex-1 h-14 sm:h-12 rounded-xl border border-border text-foreground text-base font-semibold hover:bg-muted transition text-center flex items-center justify-center"
        >
          পিছনে যান
        </Link>
      </div>
      <p className="text-xs text-muted-foreground text-right">
        মাইক্রোফোনে বলুন: “নিউ রহমান স্টোর 017…” → নাম + ফোন প্রস্তুত
      </p>
    </form>
  );
}



