import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  isLocale,
  localeFromAcceptLanguage,
  type Locale,
} from "./config";
import { getDictionary } from "./dictionaries";

/**
 * ลำดับการตัดสิน locale: cookie → Accept-Language → ค่าเริ่มต้น (ไทย)
 *
 * หมายเหตุสำหรับตอนต่อ Cache Components:
 * ห้ามเรียกฟังก์ชันนี้ภายใน `use cache` — ให้รับ locale เป็น argument แทน
 * (ดู docs/01-architecture.md §2)
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  return localeFromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}

export async function getDict() {
  return getDictionary(await getLocale());
}

export { LOCALES, type Locale };
