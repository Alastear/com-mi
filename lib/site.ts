/**
 * ข้อมูลประจำตัวของเว็บ — แหล่งเดียวของชื่อแบรนด์และ URL
 *
 * โดเมนจริงยังไม่ตัดสิน จึงห้ามฮาร์ดโค้ดชื่อโดเมนไว้ในหน้าเพจ
 * ทุกที่ต้องอ่านผ่านไฟล์นี้ พอเลือกโดเมนได้แล้วแก้ `NEXT_PUBLIC_APP_URL` ที่เดียวจบ
 */

/** ชื่อแบรนด์ที่ใช้ในที่ที่อยู่นอก React (metadata / manifest / OG) — ในหน้าเพจใช้ `t.brand.name` */
export const SITE_NAME = "com-mi";

/**
 * handle ของร้านตัวอย่างที่ปุ่ม "ดูตัวอย่างหน้าร้าน" บนหน้าแรกชี้ไป
 * ต้องตรงกับที่ scripts/seed-demo-shop.mts สร้าง — ร้านนี้ติดธง isDemo
 * จึงเปิดตรงได้แต่ไม่ขึ้นในหน้าค้นหาและไม่เข้า sitemap
 */
export const DEMO_HANDLE = "nongfah";

const FALLBACK_URL = "http://localhost:3450";

/**
 * เว็บนี้ยังเป็นรุ่นทดสอบหรือยัง — `SITE_NOINDEX=1` คือเปิดโหมดทดสอบ
 *
 * ⚠️ **กันการถูก index ด้วย `X-Robots-Tag: noindex` ไม่ใช่ `Disallow: /`**
 * `Disallow` ห้ามแค่การ "ไต่" ไม่ได้ห้ามการ "เก็บเข้าดัชนี" — URL ที่มีคนลิงก์ถึง
 * ยังโผล่ในผลค้นหาได้แบบไม่มีเนื้อหา และที่แย่กว่านั้นคือพอห้ามไต่แล้ว
 * บอตจะ **มองไม่เห็น** คำสั่ง noindex ที่เราส่งไปเลย สองอย่างนี้จึงตีกันเอง
 *
 * ทางที่ได้ผลจริงคือปล่อยให้ไต่ได้ตามปกติ แล้วส่ง noindex กลับไปทุกหน้า
 * ตอนพร้อมเปิดจริงให้ลบตัวแปรนี้ออกจาก env แล้ว deploy — ไม่ต้องแก้โค้ด
 */
export const IS_STAGING = process.env.SITE_NOINDEX === "1";

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || FALLBACK_URL;
}

/** โฮสต์ล้วน ๆ ไม่มี protocol — ใช้แสดงผล เช่น "com-mi.app" หรือ "localhost:3450" */
export function siteHost(): string {
  try {
    return new URL(siteUrl()).host;
  } catch {
    return FALLBACK_URL.replace(/^https?:\/\//, "");
  }
}

/** ลิงก์หน้าร้านแบบเต็ม สำหรับคัดลอก/แชร์ */
export function shopUrl(handle: string): string {
  return `${siteUrl()}/@${handle}`;
}

/** ลิงก์หน้าร้านแบบย่อ สำหรับแสดงบนหน้าจอ */
export function shopUrlDisplay(handle: string): string {
  return `${siteHost()}/@${handle}`;
}

/** ส่วนนำหน้าช่องกรอก handle ตอน onboarding — เช่น "com-mi.app/@" */
export function shopUrlPrefix(): string {
  return `${siteHost()}/@`;
}
