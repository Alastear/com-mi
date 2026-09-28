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
 * คำขออัปโหลดหนึ่งแถวควรทำอะไร — ฟังก์ชันล้วน เทสต์ได้โดยไม่ต้องต่อเน็ต
 *
 *   keep     — ยังไม่หมดอายุหรือยังไม่พ้นเวลาผ่อนผัน อาจกำลังอัปหรือกำลังบันทึกอยู่
 *   drop_row — มีแถว `media` ชี้ถึง key แล้ว (บันทึกสำเร็จ) ลบแค่แถวคำขอ ห้ามแตะไฟล์
 *   purge    — ไม่มีใครชี้ถึงและบันทึกไม่ได้อีกแล้ว ลบไฟล์ (และ multipart ที่ค้าง) กับแถวคำขอ
 *
 * เขียนแบบ "ต้องจริงทั้งหมดถึงจะลบ" เหมือน `isStray` — กรณีที่ไม่ได้คิดไว้ตกไปฝั่งไม่ลบ
 */
export function intentVerdict(
  intent: { key: string; createdAt: Date; expiresAt: Date },
  referenced: ReadonlySet<string>,
  now: number,
  graceMs: number = GRACE_MS,
): "keep" | "drop_row" | "purge" {
  if (now - intent.createdAt.getTime() <= graceMs) return "keep";
  if (intent.expiresAt.getTime() >= now) return "keep";
  return referenced.has(intent.key) ? "drop_row" : "purge";
}
