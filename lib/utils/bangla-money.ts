const BANGLA_DIGIT_FORMATTER = new Intl.NumberFormat("bn-BD", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BELOW_HUNDRED = [
  "শূন্য",
  "এক",
  "দুই",
  "তিন",
  "চার",
  "পাঁচ",
  "ছয়",
  "সাত",
  "আট",
  "নয়",
  "দশ",
  "এগারো",
  "বারো",
  "তেরো",
  "চৌদ্দ",
  "পনেরো",
  "ষোল",
  "সতেরো",
  "আঠারো",
  "উনিশ",
  "বিশ",
  "একুশ",
  "বাইশ",
  "তেইশ",
  "চব্বিশ",
  "পঁচিশ",
  "ছাব্বিশ",
  "সাতাশ",
  "আটাশ",
  "ঊনত্রিশ",
  "ত্রিশ",
  "একত্রিশ",
  "বত্রিশ",
  "তেত্রিশ",
  "চৌত্রিশ",
  "পঁয়ত্রিশ",
  "ছত্রিশ",
  "সাঁইত্রিশ",
  "আটত্রিশ",
  "ঊনচল্লিশ",
  "চল্লিশ",
  "একচল্লিশ",
  "বিয়াল্লিশ",
  "তেতাল্লিশ",
  "চুয়াল্লিশ",
  "পঁয়তাল্লিশ",
  "ছেচল্লিশ",
  "সাতচল্লিশ",
  "আটচল্লিশ",
  "ঊনপঞ্চাশ",
  "পঞ্চাশ",
  "একান্ন",
  "বায়ান্ন",
  "তিপ্পান্ন",
  "চুয়ান্ন",
  "পঞ্চান্ন",
  "ছাপ্পান্ন",
  "সাতান্ন",
  "আটান্ন",
  "ঊনষাট",
  "ষাট",
  "একষট্টি",
  "বাষট্টি",
  "তেষট্টি",
  "চৌষট্টি",
  "পঁয়ষট্টি",
  "ছেষট্টি",
  "সাতষট্টি",
  "আটষট্টি",
  "ঊনসত্তর",
  "সত্তর",
  "একাত্তর",
  "বাহাত্তর",
  "তেহাত্তর",
  "চুয়াত্তর",
  "পঁচাত্তর",
  "ছিয়াত্তর",
  "সাতাত্তর",
  "আটাত্তর",
  "ঊনআশি",
  "আশি",
  "একাশি",
  "বিরাশি",
  "তিরাশি",
  "চুরাশি",
  "পঁচাশি",
  "ছিয়াশি",
  "সাতাশি",
  "আটাশি",
  "ঊননব্বই",
  "নব্বই",
  "একানব্বই",
  "বিরানব্বই",
  "তিরানব্বই",
  "চুরানব্বই",
  "পঁচানব্বই",
  "ছিয়ানব্বই",
  "সাতানব্বই",
  "আটানব্বই",
  "নিরানব্বই",
] as const;

function toWordsBelowThousand(value: number): string {
  if (value < 100) return BELOW_HUNDRED[value];

  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (rest === 0) {
    return `${BELOW_HUNDRED[hundreds]} শত`;
  }
  return `${BELOW_HUNDRED[hundreds]} শত ${BELOW_HUNDRED[rest]}`;
}

function toBanglaNumberWords(value: number): string {
  if (value === 0) return BELOW_HUNDRED[0];

  const parts: string[] = [];
  let remaining = Math.floor(value);

  const crore = Math.floor(remaining / 10000000);
  if (crore > 0) {
    parts.push(`${toBanglaNumberWords(crore)} কোটি`);
    remaining %= 10000000;
  }

  const lakh = Math.floor(remaining / 100000);
  if (lakh > 0) {
    parts.push(`${toWordsBelowThousand(lakh)} লাখ`);
    remaining %= 100000;
  }

  const thousand = Math.floor(remaining / 1000);
  if (thousand > 0) {
    parts.push(`${toWordsBelowThousand(thousand)} হাজার`);
    remaining %= 1000;
  }

  if (remaining > 0) {
    parts.push(toWordsBelowThousand(remaining));
  }

  return parts.join(" ").trim();
}

export function formatBanglaMoney(value: number): string {
  if (!Number.isFinite(value)) return "০.০০ ৳";
  return `${BANGLA_DIGIT_FORMATTER.format(value)} ৳`;
}

export function amountToBanglaWords(value: number): string {
  if (!Number.isFinite(value)) return "শূন্য টাকা";

  const negative = value < 0;
  const normalized = Math.abs(value);
  const taka = Math.floor(normalized);
  const poysha = Math.round((normalized - taka) * 100);
  const normalizedTaka = poysha === 100 ? taka + 1 : taka;
  const normalizedPoysha = poysha === 100 ? 0 : poysha;

  const takaWords = `${toBanglaNumberWords(normalizedTaka)} টাকা`;
  const poyshaWords =
    normalizedPoysha > 0
      ? ` ${toBanglaNumberWords(normalizedPoysha)} পয়সা`
      : "";

  return `${negative ? "মাইনাস " : ""}${takaWords}${poyshaWords}`.trim();
}
