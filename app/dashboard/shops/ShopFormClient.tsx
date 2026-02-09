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
    salesInvoiceEnabled?: boolean;
    salesInvoicePrefix?: string | null;
  };
  submitLabel?: string;
  ownerOptions?: Array<{ id: string; name: string | null; email: string | null }>;
  businessTypeOptions?: Array<{ id: string; label: string }>;
  showSalesInvoiceSettings?: boolean;
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

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

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
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [templates, setTemplates] = useState<ShopTemplate[]>([]);
  const [voiceReady, setVoiceReady] = useState(false);
  const [listeningField, setListeningField] = useState<VoiceField | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const availableBusinessTypes = businessTypeOptions?.length ? businessTypeOptions : businessOptions;
  const [businessType, setBusinessType] = useState<string>(
    initial?.businessType || availableBusinessTypes[0]?.id || "tea_stall"
  );
  const [salesInvoiceEnabled, setSalesInvoiceEnabled] = useState<boolean>(
    Boolean(initial?.salesInvoiceEnabled ?? false)
  );
  const [salesInvoicePrefix, setSalesInvoicePrefix] = useState<string>(
    initial?.salesInvoicePrefix || "INV"
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
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setVoiceReady(Boolean(SpeechRecognitionImpl));
    });
    return () => {
      cancelled = true;
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

  function startVoice(field: "name" | "address" | "phone") {
    if (listeningField === field) return;
    if (listeningField) stopVoice();
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setVoiceError("ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না");
      return;
    }

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onerror = () => {
      setListeningField(null);
      setVoiceError("মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি");
    };
    recognition.onend = () => setListeningField(null);
    recognition.onresult = (event: any) => {
      const spoken: string | undefined = event?.results?.[0]?.[0]?.transcript;
      if (spoken) {
        if (field === "name") {
          const parsed = parseSpokenNameAndPhone(spoken);
          if (parsed.name) setName(parsed.name);
          if (parsed.phone) setPhone(parsed.phone);
        } else if (field === "address") {
          setAddress(spoken);
        } else if (field === "phone") {
          const parsedPhone = parsePhone(spoken);
          if (parsedPhone) setPhone(parsedPhone);
        }
      }
      setListeningField(null);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setListeningField(field);
    recognition.start();
  }

  function stopVoice() {
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
    const payloadSalesInvoiceEnabled = Boolean(salesInvoiceEnabled);
    const payloadSalesInvoicePrefix = salesInvoicePrefix
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);

    form.set("name", payloadName);
    form.set("address", payloadAddress);
    form.set("phone", payloadPhone);
    form.set("businessType", payloadBusinessType);
    if (showSalesInvoiceSettings) {
      form.set("salesInvoiceEnabled", payloadSalesInvoiceEnabled ? "1" : "0");
      form.set("salesInvoicePrefix", payloadSalesInvoicePrefix);
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
                salesInvoiceEnabled: payloadSalesInvoiceEnabled,
                salesInvoicePrefix: payloadSalesInvoicePrefix || null,
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
      handlePermissionError(err);
      setSubmitError(
        err instanceof Error ? err.message : "Shop তৈরি করতে ব্যর্থ"
      );
    }
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

      {showSalesInvoiceSettings ? (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-foreground">
              বিক্রির ইনভয়েস ফিচার
            </label>
            <p className="text-xs text-muted-foreground">
              এই দোকানে ফিচার চালু থাকলে এবং ইউজারের পারমিশন থাকলে sales invoice issue হবে।
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={salesInvoiceEnabled}
              onChange={(e) => setSalesInvoiceEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
            />
            এই দোকানে Sales Invoice চালু
          </label>
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
        </div>
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



