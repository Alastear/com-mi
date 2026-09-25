export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "th";
export const LOCALE_COOKIE = "locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  th: "ไทย",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * ภาษาแรกใน Accept-Language ที่เรารองรับ — null ถ้าไม่มีเลย
 *
 * ใช้ทั้งตอนเรนเดอร์หน้า (`getLocale`) และตอนล็อกอิน (lib/auth.ts) ต้องเป็นตัวเดียวกัน
 * ไม่งั้นหน้าเว็บกับอีเมลจะเดาภาษาของคนเดียวกันออกมาไม่ตรงกัน
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
