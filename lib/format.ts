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

/**
 * ยอดของหนึ่งบรรทัดในสรุปราคา — ระดับ/ตัวเลือกที่เป็นศูนย์ขึ้นว่า "รวมในราคา" แทน "฿0"
 *
 * ระดับที่ไม่บวกเงินเพิ่ม (เช่น "ลงสีเต็ม +0") ถูกเก็บเป็นบรรทัดของตัวเองเสมอ
 * เพราะออเดอร์ต้องจำว่าลูกค้าเลือกระดับไหน พอแสดงเป็น "Full render ฿0"
 * คนอ่านเข้าใจว่าได้งานนั้นฟรี หรือราคาหลักไม่ได้รวมมันไว้ ทั้งที่ยอดอยู่ในบรรทัดแรกแล้ว
 *
 * ⚠️ เฉพาะ `tier` / `option` เท่านั้น — สองชนิดนี้คือ "ของที่เลือกแล้วรวมอยู่ในราคาหลัก"
 * บรรทัดอื่นที่เป็นศูนย์ไม่ได้แปลว่ารวมในราคา: บรรทัดหลัก ฿0 ของเมนูแบบเสนอราคาคือ
 * "ยังไม่ได้ตั้งราคา" และบรรทัดตัวคูณที่ปัดแล้วเหลือ ฿0 คือคิดเพิ่มศูนย์บาทจริง ๆ
 * ถ้าเขียนว่า "รวมในราคา" ทั้งสองกรณี ลูกค้าจะอ่านว่ามีราคาอยู่แล้วทั้งที่ไม่มี
 *
 * ⚠️ แตะแค่การแสดงผล — บรรทัดและยอดที่เก็บไม่เปลี่ยน ผลรวมของบรรทัดยังเท่ากับยอดรวมเสมอ
 * ใช้ทุกที่ที่เรนเดอร์บรรทัดราคา ไม่งั้นลูกค้าเห็นคำหนึ่งตอนสั่ง อีกคำหนึ่งหลังสั่ง
 */
export function formatLineAmount(
  cents: number,
  /** `PriceLine.kind` / `order_item.kind` */
  kind: string,
  includedLabel: string,
  currency = "THB",
  locale: Locale = "th",
): string {
  const includable = kind === "tier" || kind === "option";
  return cents === 0 && includable ? includedLabel : formatMoney(cents, currency, locale);
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

/**
 * "ก.ย. 2569" / "Sep 2026" จากสตริง "YYYY-MM"
 *
 * รับเป็นสตริงเดือน ไม่ใช่ Date โดยตั้งใจ — ใช้กับรีวิวบนหน้าร้าน ซึ่งต้องบอกแค่เดือนที่สั่ง
 * คิวรีตัดเหลือเดือนตั้งแต่ใน SQL (lib/queries/reputation.ts) วันที่เต็มจึงไม่เคยออกจาก server
 * ตั้งเวลากลางเดือนแบบ UTC แล้วฟอร์แมตเป็น UTC — ไม่มีเขตเวลาไหนเลื่อนข้ามเดือนได้
 * รูปแบบผิด = คืนค่าเดิม ดีกว่า "Invalid Date" บนหน้าร้าน
 */
export function formatYearMonth(ym: string, locale: Locale = "th"): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return ym;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(m[1]), month - 1, 15)));
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
