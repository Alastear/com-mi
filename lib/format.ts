import type { Locale } from "@/lib/i18n/config";

/**
 * แมป locale ของแอปเป็น BCP-47 tag ให้ Intl
 * นี่ไม่ใช่ "ข้อความ" จึงไม่ต้องอยู่ในพจนานุกรม — แต่ต้องอยู่ที่เดียวเพื่อไม่ให้กระจาย
 */
export function intlLocale(locale: Locale): string {
  return locale === "th" ? "th-TH" : "en-US";
}

/** เงินเก็บเป็นสตางค์เสมอ (integer) — ห้ามใช้ float กับเงิน */
export function formatMoney(cents: number, currency = "THB", locale: Locale = "th"): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatNumber(value: number, locale: Locale = "th"): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function formatDate(date: Date | string, locale: Locale = "th"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string, locale: Locale = "th"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * "2 ชั่วโมงที่แล้ว" / "อีก 3 วัน"
 * ใช้ Intl.RelativeTimeFormat เพื่อไม่ต้องเขียนกฎภาษาเอง
 */
export function formatRelative(
  target: Date | string,
  locale: Locale = "th",
  now: Date = new Date(),
): string {
  const d = typeof target === "string" ? new Date(target) : target;
  const diffMs = d.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return rtf.format(Math.round(diffMs / 1000), "second");
}

/** จำนวนวันเต็มจากตอนนี้ถึงกำหนดส่ง — ติดลบ = เลยกำหนด */
export function daysUntil(target: Date | string, now: Date = new Date()): number {
  const d = typeof target === "string" ? new Date(target) : target;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((startOfDay(d) - startOfDay(now)) / (24 * 60 * 60 * 1000));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
