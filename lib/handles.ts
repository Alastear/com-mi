/**
 * กติกาของ handle (`/@handle`)
 *
 * handle ชนกับ route จริงไม่ได้ เพราะหน้าร้านอยู่ที่ segment บนสุด (`app/(public)/[handle]`)
 * ถ้าใครจอง "pricing" ได้ หน้า /pricing จะถูกบังทันที
 */
export const RESERVED_HANDLES = new Set([
  // route ที่มีอยู่จริงตอนนี้
  "api", "app", "dashboard", "explore", "pricing", "legal", "sign-in", "sign-up",
  "settings", "orders", "services", "portfolio", "listings", "clients", "calendar",
  "analytics", "onboarding", "my",
  // ของ Next.js / โฮสต์
  "_next", "static", "public", "favicon.ico", "robots.txt", "sitemap.xml", "manifest.webmanifest",
  // กันไว้ใช้ในอนาคต
  "admin", "help", "support", "about", "blog", "docs", "status", "terms", "privacy",
  "billing", "team", "teams", "studio", "shop", "shops", "search", "new", "edit",
  "login", "logout", "signin", "signout", "register", "account", "profile", "me",
  "contact", "careers", "press", "security", "changelog", "roadmap", "feed", "rss",
]);

export const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

export type HandleCheck =
  | { ok: true; handle: string }
  | { ok: false; reason: "format" | "reserved" };

/** normalize + validate — ยังไม่เช็คว่าซ้ำในฐานข้อมูลไหม (ตรงนั้นต้องถาม DB) */
export function checkHandle(input: string): HandleCheck {
  const handle = input.trim().toLowerCase().replace(/^@/, "");
  if (!HANDLE_PATTERN.test(handle)) return { ok: false, reason: "format" };
  if (RESERVED_HANDLES.has(handle)) return { ok: false, reason: "reserved" };
  return { ok: true, handle };
}

/**
 * เดา handle จากชื่อ Google เพื่อเติมให้ล่วงหน้า (ผู้ใช้แก้ได้)
 *
 * ชื่อไทย/ญี่ปุ่น/จีนจะถูก strip จนเหลือว่าง ซึ่งเป็นเคสปกติของกลุ่มเป้าหมายเรา
 * จึงต้องมี fallback ที่ยังดูเป็นชื่อคน ไม่ใช่ `"000"` ที่ทั้งน่าเกลียดและชนกันง่าย
 */
export function suggestHandle(name: string, email: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const fromName = clean(name);
  if (fromName.length >= 3) return fromName.slice(0, 30);

  const fromEmail = clean(email.split("@")[0] ?? "");
  if (fromEmail.length >= 3) return fromEmail.slice(0, 30);

  // เดาจากทั้งสองทางไม่ได้ — ให้ชื่อกลาง ๆ ที่ไม่ชนกัน แทนที่จะเป็น "000"
  const seed = [...`${name}${email}`].reduce((h, ch) => (h * 31 + ch.codePointAt(0)!) >>> 0, 7);
  return `creator${seed.toString(36).slice(0, 5)}`;
}
