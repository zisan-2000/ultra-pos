const BANGLA_DIGIT_MAP: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

const DIGIT_WORD_MAP: Record<string, string> = {
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  zero: "0",
  o: "0",
  oh: "0",
  one: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  শূন্য: "0",
  শুন্য: "0",
  জিরো: "0",
  এক: "1",
  দুই: "2",
  তিন: "3",
  চার: "4",
  পাঁচ: "5",
  ছয়: "6",
  ছয়: "6",
  সাত: "7",
  আট: "8",
  নয়: "9",
  নয়: "9",
};

function normalizeDigits(value: string) {
  return value.replace(/[০-৯]/g, (char) => BANGLA_DIGIT_MAP[char] ?? char);
}

export function parsePhoneInput(value: string, maxLength = 15) {
  const normalized = normalizeDigits(String(value || "").trim())
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  const parts = normalized.split(" ").filter(Boolean);
  let digits = "";

  for (const part of parts) {
    if (digits.length >= maxLength) break;

    if (DIGIT_WORD_MAP[part]) {
      digits += DIGIT_WORD_MAP[part];
      continue;
    }

    const numeric = part.replace(/\D/g, "");
    if (numeric) {
      digits += numeric;
    }
  }

  return digits.slice(0, maxLength);
}
