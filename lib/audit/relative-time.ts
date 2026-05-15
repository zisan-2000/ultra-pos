// lib/audit/relative-time.ts
//
// Bengali "X মিনিট আগে" / "এইমাত্র" / "৩ ঘণ্টা আগে" formatter for audit rows.
// Falls back to a full date once the event is older than ~7 days.

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

function toBn(value: number | string) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function formatRelativeBn(iso: string | Date, now: Date = new Date()): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = now.getTime() - date.getTime();

  // Future timestamps fall back to absolute (clock skew safety).
  if (diffMs < 0) return formatAbsoluteBn(date);

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return "এইমাত্র";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${toBn(minutes)} মিনিট আগে`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toBn(hours)} ঘণ্টা আগে`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${toBn(days)} দিন আগে`;

  return formatAbsoluteBn(date);
}

/** Full Bengali date + time, e.g. "১৫ মে ২০২৬, ১১:৩০ AM". */
export function formatAbsoluteBn(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("bn-BD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Just the date portion, e.g. "১৫ মে ২০২৬". */
export function formatDateBn(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("bn-BD", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Bucket label for date grouping: "আজ", "গতকাল", "১৫ মে ২০২৬". */
export function dateBucketLabel(iso: string | Date, today: Date = new Date()): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "অজানা তারিখ";

  const startOfDay = (dt: Date) =>
    new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();

  const todayStart = startOfDay(today);
  const eventStart = startOfDay(d);
  const dayDiff = Math.floor((todayStart - eventStart) / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) return "আজ";
  if (dayDiff === 1) return "গতকাল";
  return formatDateBn(d);
}
