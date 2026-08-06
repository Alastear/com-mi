/**
 * ข้อมูลประจำตัวของเว็บ — แหล่งเดียวของชื่อแบรนด์และ URL
 *
 * โดเมนจริงยังไม่ตัดสิน จึงห้ามฮาร์ดโค้ดชื่อโดเมนไว้ในหน้าเพจ
 * ทุกที่ต้องอ่านผ่านไฟล์นี้ พอเลือกโดเมนได้แล้วแก้ `NEXT_PUBLIC_APP_URL` ที่เดียวจบ
 */

/** ชื่อแบรนด์ที่ใช้ในที่ที่อยู่นอก React (metadata / manifest / OG) — ในหน้าเพจใช้ `t.brand.name` */
export const SITE_NAME = "com-mi";

const FALLBACK_URL = "http://localhost:3450";

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
