// app/dashboard/shops/ShopFormClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { businessOptions, type BusinessType } from "@/lib/productFormConfig";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  businessType: BusinessType;
  count: number;
  lastUsed: number;
};

type Props = {
  backHref: string;
  action: (formData: FormData) => Promise<void>;
  initial?: {
    name?: string;
    address?: string;
    phone?: string;
    businessType?: BusinessType;
  };
  submitLabel?: string;
  ownerOptions?: Array<{ id: string; name: string | null; email: string | null }>;
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

export default function ShopFormClient({
  backHref,
  action,
  initial,
  submitLabel = "+ দ্রুত দোকান যোগ করুন",
  ownerOptions,
}: Props) {
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [templates, setTemplates] = useState<ShopTemplate[]>([]);
  const [voiceReady, setVoiceReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [businessType, setBusinessType] = useState<BusinessType>(initial?.businessType || "tea_stall");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const hasOwnerOptions = Boolean(ownerOptions && ownerOptions.length > 0);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(SHOP_TEMPLATE_KEY) : null;
    if (stored) {
      try {
        setTemplates(JSON.parse(stored) as ShopTemplate[]);
      } catch {
        setTemplates([]);
      }
    }
  }, []);

  useEffect(() => {
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  useEffect(() => {
    if (!ownerOptions) return;
    if (ownerOptions.length === 0) {
      setSelectedOwnerId("");
      return;
    }
    setSelectedOwnerId((prev) => prev || ownerOptions[0]?.id || "");
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
    const counts: Record<BusinessType, number> = {} as any;
    templates.forEach((t) => {
      counts[t.businessType] = (counts[t.businessType] ?? 0) + t.count;
    });
    return counts;
  }, [templates]);

  const sortedBusinessOptions = useMemo(() => {
    return businessOptions
      .slice()
      .sort(
        (a, b) =>
          (businessUsage[b.id as BusinessType] ?? 0) - (businessUsage[a.id as BusinessType] ?? 0)
      );
  }, [businessUsage]);

  function persistTemplates(next: ShopTemplate[]) {
    setTemplates(next);
    localStorage.setItem(SHOP_TEMPLATE_KEY, JSON.stringify(next));
  }

  function applyTemplate(t: ShopTemplate) {
    setName(t.name);
    setAddress(t.address || "");
    setPhone(t.phone || "");
    setBusinessType(t.businessType || "tea_stall");
  }

  function startVoice(field: "name" | "address" | "phone") {
    if (listening) return;
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
      setListening(false);
      setVoiceError("মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি");
    };
    recognition.onend = () => setListening(false);
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
      setListening(false);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setListening(true);
    recognition.start();
  }

  function stopVoice() {
    recognitionRef.current?.stop?.();
    setListening(false);
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

    const payloadName = (form.get("name") as string) || name;
    const payloadAddress = (form.get("address") as string) || address;
    const payloadPhone = (form.get("phone") as string) || phone;
    const payloadBusinessType =
      ((form.get("businessType") as BusinessType) || businessType) as BusinessType;

    form.set("name", payloadName);
    form.set("address", payloadAddress);
    form.set("phone", payloadPhone);
    form.set("businessType", payloadBusinessType);
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
      await action(form);
      router.push(backHref);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Shop তৈরি করতে ব্যর্থ"
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
      {ownerOptions ? (
        <div className="space-y-2">
          <label className="block text-base font-medium text-gray-900">মালিক নির্বাচন করুন *</label>
          <select
            name="ownerId"
            value={selectedOwnerId}
            onChange={(e) => setSelectedOwnerId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <p className="text-sm text-gray-500">এই দোকানটি কোন মালিকের অধীনে হবে তা নির্বাচন করুন</p>
        </div>
      ) : null}

      {/* Shop Name */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">দোকানের নাম *</label>
        <div className="flex gap-3">
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: নিউ মদিনা স্টোর"
            required
            autoComplete="off"
          />
          <button
            type="button"
            onClick={listening ? stopVoice : () => startVoice("name")}
            disabled={!voiceReady}
            className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
              listening
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-300"
            } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {listening ? "থামান" : "ভয়েস"}
          </button>
        </div>
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
                className="px-3 py-2 rounded-full border border-blue-200 text-blue-800 bg-blue-50 text-sm hover:border-blue-300"
              >
                {title}
              </button>
            ))}
          </div>
        )}
        <p className="text-sm text-gray-500">বলুন: “মদিনা স্টোর 017xxxxxxx” → নাম + ফোন</p>
      </div>

      {/* Address */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">ঠিকানা (ঐচ্ছিক)</label>
        <div className="flex gap-3">
          <input
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: ১২/বি প্রধান সড়ক, ঢাকা"
          />
          <button
            type="button"
            onClick={listening ? stopVoice : () => startVoice("address")}
            disabled={!voiceReady}
            className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
              listening
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-300"
            } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {listening ? "থামান" : "ভয়েস"}
          </button>
        </div>
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">মোবাইল নাম্বার (ঐচ্ছিক)</label>
        <div className="flex gap-3">
          <input
            name="phone"
            value={phone}
            onChange={(e) => setPhone(parsePhone(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="যেমন: 01700000000"
          />
          <button
            type="button"
            onClick={listening ? stopVoice : () => startVoice("phone")}
            disabled={!voiceReady}
            className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
              listening
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-300"
            } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {listening ? "থামান" : "ভয়েস"}
          </button>
        </div>
        <p className="text-sm text-gray-500">সংখ্যা বললে/পেস্ট করলে অটো ক্লিন হবে</p>
      </div>

      {/* Business Type */}
      <div className="space-y-2">
        <label className="block text-base font-medium text-gray-900">ব্যবসার ধরন</label>
        <div className="flex flex-wrap gap-2">
          {sortedBusinessOptions.slice(0, 6).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBusinessType(b.id as BusinessType)}
              className={`px-3 py-2 rounded-full border text-sm ${
                businessType === b.id
                  ? "bg-blue-50 border-blue-400 text-blue-800"
                  : "bg-white border-slate-200 text-slate-700 hover:border-blue-200"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <select
          name="businessType"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value as BusinessType)}
          className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          {businessOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-gray-500">সর্বশেষ ব্যবহারকৃত টাইপগুলো উপরে দেখাচ্ছে</p>
      </div>

      {/* Recent Templates */}
      {recentTemplates.length > 0 && (
        <div className="border border-blue-100 bg-blue-50 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-blue-800">রিসেন্ট দোকান</h3>
            <span className="text-xs text-blue-700">এক ট্যাপে অটো-ফিল</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentTemplates.slice(0, 4).map((t) => (
              <button
                key={`${t.name}-${t.lastUsed}`}
                type="button"
                onClick={() => applyTemplate(t)}
                className="flex items-center justify-between gap-3 bg-white border border-blue-100 rounded-lg px-3 py-2 text-left hover:border-blue-300 transition-colors"
              >
                <div>
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500">
                    {t.address || "ঠিকানা নেই"} • {t.phone || "ফোন নেই"}
                  </p>
                </div>
                <span className="text-xs text-blue-700">
                  {businessOptions.find((b) => b.id === t.businessType)?.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
        >
          {submitLabel}
        </button>
        <Link
          href={backHref}
          className="flex-1 border border-slate-300 text-slate-900 font-medium py-4 px-6 rounded-lg text-lg hover:bg-slate-100 transition-colors text-center"
        >
          পিছনে যান
        </Link>
      </div>
      <p className="text-xs text-gray-500 text-right">
        মাইক্রোফোনে বলুন: “নিউ রহমান স্টোর 017…” → নাম + ফোন প্রস্তুত
      </p>
      {voiceError ? <p className="text-xs text-red-600">{voiceError}</p> : null}
      {submitError ? (
        <p className="text-xs text-red-600">{submitError}</p>
      ) : null}
    </form>
  );
}
