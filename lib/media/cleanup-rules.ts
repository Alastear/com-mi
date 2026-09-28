/**
 * กฎของงานเก็บกวาด (lib/media/cleanup.ts) ว่าอะไรลบได้ อะไรห้ามลบ
 *
 * ⚠️ เป็นไฟล์บริสุทธิ์ ห้าม import "server-only" หรือ DB — มีเทสต์ด้วย node:test
 * แยกออกมาจาก cleanup.ts เพราะตัวนั้นต้องคุยกับ R2 ซึ่ง import "server-only"
 */

/** เวลาผ่อนผัน — ไฟล์ที่เพิ่งอัปยังอยู่ระหว่างทางไป `registerMedia()` ได้ */
export const GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * ไฟล์นี้ลบได้ไหม — แยกออกมาเป็นฟังก์ชันล้วนเพื่อให้เทสต์ได้โดยไม่ต้องต่อเน็ต
 *
 * เขียนเป็น "เงื่อนไขที่ต้องจริงทั้งหมดถึงจะลบ" ไม่ใช่ "เงื่อนไขที่ห้ามลบ" —
 * ตัวแปรใหม่ที่โผล่มาทีหลังจะตกไปอยู่ฝั่งไม่ลบเสมอ ซึ่งเป็นฝั่งที่ปลอดภัย
 */
export function isStray(
  blob: { pathname: string; uploadedAt: Date },
  referenced: ReadonlySet<string>,
  now: number,
  graceMs: number = GRACE_MS,
): boolean {
  if (referenced.has(blob.pathname)) return false;
  return now - blob.uploadedAt.getTime() > graceMs;
}

/**
 * แถว orphan นี้เริ่มนับเวลาผ่อนผันเมื่อไร
 *
 * แถวที่อัปแล้วยังไม่เคยผูก → นับจาก `createdAt` (ไฟล์อาจกำลังเดินทางไปผูกอยู่)
 * แถวที่เคยผูกแล้วถูกปลด (เปลี่ยนรูป ลบผลงาน) → นับจาก `orphanedAt`
 *
 * ⚠️ ห้ามนับจาก `createdAt` อย่างเดียว — อวาตาร์ที่อัปเมื่อปีก่อนแล้วเพิ่งถูกเปลี่ยน
 * จะ "เก่าเกิน 24 ชม." ทันทีและโดนลบในรอบถัดไป ทั้งที่แท็บที่เปิดค้างไว้ (หน้าร้าน
 * หน้าออเดอร์ที่ลูกค้าเปิดทิ้งไว้) ยังโหลดรูปนั้นอยู่ ให้เวลาผ่อนผันเต็มนับจากตอนที่เลิกใช้
 */
export function orphanSince(row: { createdAt: Date; orphanedAt: Date | null }): Date {
  return row.orphanedAt ?? row.createdAt;
}

/**
 * แถว media นี้ถึงเวลาลบแล้วหรือยัง — ต้องจริงทั้งหมดถึงจะลบ (กรณีที่ไม่ได้คิดไว้ตกไปฝั่งไม่ลบ)
 *
 * ตรงกับ `dueOrphanSql` ใน lib/media/references.ts ยกเว้นเรื่อง "ยังมีใครอ้างถึงไหม"
 * ซึ่งตอบได้แค่ในฐานข้อมูล — ฟังก์ชันนี้ใช้ยืนยันซ้ำก่อนลบจริง ไม่ได้ใช้แทน SQL
 */
export function isOrphanDue(
  row: { status: string; access: string; createdAt: Date; orphanedAt: Date | null },
  now: number,
  graceMs: number = GRACE_MS,
): boolean {
  if (row.status !== "orphan") return false;
  // ถังส่วนตัวไม่แตะ — เหตุผลอยู่ที่หัวไฟล์ lib/media/cleanup.ts
  if (row.access !== "public") return false;
  return now - orphanSince(row).getTime() > graceMs;
}

/**
 * ทุก pathname ที่ยังมีแถวชี้ถึง
 *
 * ⚠️ ต้องรวม `posterPathname` ด้วย ไม่ใช่แค่ `pathname`
 * โปสเตอร์ของวิดีโอถูกเก็บเป็น "คอลัมน์ของแถวอื่น" ไม่ได้มีแถวเป็นของตัวเอง
 * (`components/portfolio-uploader.tsx` ส่ง `posterPathname` มาพร้อมวิดีโอ)
 * ถ้าดูแค่ `pathname` โปสเตอร์ทุกอันจะดูเหมือนไฟล์กำพร้าและถูกลบทิ้งหมด
 */
export function referencedPaths(
  rows: ReadonlyArray<{ pathname: string | null; posterPathname: string | null }>,
): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.pathname) set.add(r.pathname);
    if (r.posterPathname) set.add(r.posterPathname);
  }
  return set;
}

/**
 * คำขอที่ไม่เคยถูกใช้ ต้องหมดอายุไปนานเท่านี้ก่อนจะถือว่า "ไม่มีใครบันทึกได้อีกแล้ว"
 *
 * กันนาฬิกาของเครื่องที่รัน cron เดินเร็วกว่า Postgres — `claimIntent` ตัดสินหมดอายุด้วย
 * `now()` ของ DB ถ้าเราเห็นว่าหมดอายุก่อน DB เห็น อาจลบไฟล์ที่กำลังถูกบันทึกอยู่พอดี
 */
export const INTENT_EXPIRY_MARGIN_MS = 10 * 60 * 1000;

/**
 * คำขออัปโหลดหนึ่งแถวควรทำอะไร — ฟังก์ชันล้วน เทสต์ได้โดยไม่ต้องต่อเน็ต
 *
 *   keep     — ยังไม่หมดอายุหรือยังไม่พ้นเวลาผ่อนผัน อาจกำลังอัปหรือกำลังบันทึกอยู่
 *   drop_row — มีแถว `media` ชี้ถึง key แล้ว (บันทึกสำเร็จ) ลบแค่แถวคำขอ ห้ามแตะไฟล์
 *   purge    — ไม่มีใครชี้ถึงและบันทึกไม่ได้อีกแล้ว ลบไฟล์ (และ multipart ที่ค้าง) กับแถวคำขอ
 *
 * สองกรณีของ "บันทึกไม่ได้อีกแล้ว":
 *   ไม่เคยถูกใช้ (`consumedAt` ว่าง) และหมดอายุเกิน `INTENT_EXPIRY_MARGIN_MS`
 *     — `claimIntent` ต้องการคำขอที่ยังไม่หมดอายุ จึงไม่มีใครเริ่มบันทึกได้อีก
 *     ไม่ต้องรอเวลาผ่อนผัน 24 ชม.: คำขอเลิกจองโควตาตั้งแต่หมดอายุ ยิ่งปล่อยชิ้นค้างไว้นาน
 *     ยิ่งเป็นช่องให้กองไฟล์ไว้ในถังโดยไม่ติดโควตา
 *   ถูกใช้แล้ว — ต้องพ้นเวลาผ่อนผันด้วย ถูก claim ก่อนหมดอายุไม่กี่วินาทีก็ยังประกอบไฟล์และ
 *     insert อยู่ได้หลังหมดอายุ ลบตอนนั้นคือแถว `media` ชี้ไฟล์ที่ไม่มีอยู่
 *
 * เขียนแบบ "ต้องจริงทั้งหมดถึงจะลบ" เหมือน `isStray` — กรณีที่ไม่ได้คิดไว้ตกไปฝั่งไม่ลบ
 * และทุกทางที่ลบต้องผ่าน `referenced` ก่อนเสมอ
 */
export function intentVerdict(
  intent: { key: string; createdAt: Date; expiresAt: Date; consumedAt: Date | null },
  referenced: ReadonlySet<string>,
  now: number,
  graceMs: number = GRACE_MS,
): "keep" | "drop_row" | "purge" {
  if (intent.expiresAt.getTime() >= now) return "keep";
  if (intent.consumedAt === null) {
    if (now - intent.expiresAt.getTime() <= INTENT_EXPIRY_MARGIN_MS) return "keep";
  } else if (now - intent.createdAt.getTime() <= graceMs) {
    return "keep";
  }
  return referenced.has(intent.key) ? "drop_row" : "purge";
}
