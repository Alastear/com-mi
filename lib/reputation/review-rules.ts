import type { OrderStatus } from "@/lib/types";

/**
 * กติการีวิว — ตรรกะล้วน ๆ ใช้ได้ทั้ง server และ client
 *
 * ⚠️ ด่านจริงอยู่ใน SQL ของ lib/reputation/actions.ts (เช็คกับแถวล่าสุดในคำสั่งเดียวกับการเขียน)
 * ที่นี่ใช้ตัดสินว่าจะโชว์ฟอร์มไหม และตอบ error ให้ตรงเรื่อง — แก้กติกาข้อไหนต้องแก้ทั้งสองที่
 */

/** แก้รีวิวได้กี่วันนับจากตอนเขียนครั้งแรก — ⚠️ ตรงกับ `interval '7 days'` ใน actions.ts */
export const REVIEW_EDIT_DAYS = 7;
export const REVIEW_BODY_MAX = 500;
export const REVIEW_REPLY_MAX = 500;

const DAY_MS = 86_400_000;

/**
 * ร้าน **เคย** ยืนยันรับเงินของออเดอร์นี้ไหม — รวมแถวที่ถูกยกเลิกการยืนยันทีหลัง
 *
 * ⚠️ ไม่ดู `voidedAt` โดยตั้งใจ — เหตุผลเต็มอยู่ที่ `PAID_ONCE_SQL` (paid-once-sql.ts)
 * สั้น ๆ: ถ้าดูยอด ณ ตอนนี้ ร้านกด "ยกเลิกการยืนยัน" บนงานที่เสร็จแล้วเพื่อกันลูกค้าไม่ให้รีวิว
 * หรือซ่อนรีวิวที่เขียนแล้วได้ ต้องตรงกับ SQL ตัวนั้นทุกเงื่อนไข
 */
export function paidOnce(
  payments: ReadonlyArray<{ verifiedAt: Date | string | null }>,
): boolean {
  return payments.some((p) => p.verifiedAt !== null);
}

/**
 * ลูกค้ารีวิวออเดอร์นี้ได้ไหม
 *
 *   ok            — งานเสร็จและร้านเคยยืนยันรับเงินแล้ว
 *   not_completed — งานยังไม่จบ หรือจบแบบไม่ได้งาน (ยกเลิก/ปฏิเสธ/หมดอายุ)
 *   unpaid        — จบแล้วแต่ร้านไม่เคยยืนยันเงินเลย (ออเดอร์เก่าก่อนมีด่านเงินตอนส่งงาน)
 *
 * ⚠️ ต้องมีเงินเข้าด้วยเหตุผลเดียวกับประวัติร้าน — ไม่งั้นบัญชีปลอมสั่งงานฟรีแล้วรีวิวให้ร้านตัวเองได้
 * (กันได้แค่คนที่ไม่ตั้งใจโกง — ดูหมายเหตุ "สิ่งที่ตัวเลขนี้พิสูจน์ไม่ได้" ใน lib/queries/reputation.ts)
 * ตรงกับ `status = 'completed' and PAID_ONCE_SQL` ใน `createReview`
 */
export type ReviewEligibility = "ok" | "not_completed" | "unpaid";

export function reviewEligibility(o: {
  status: OrderStatus | string;
  paidOnce: boolean;
}): ReviewEligibility {
  if (o.status !== "completed") return "not_completed";
  if (!o.paidOnce) return "unpaid";
  return "ok";
}

/** แก้ได้ถึงเมื่อไร — นับจากตอนเขียนครั้งแรก ไม่ใช่จากการแก้ครั้งล่าสุด */
export function reviewEditableUntil(createdAt: Date | string): Date {
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return new Date(d.getTime() + REVIEW_EDIT_DAYS * DAY_MS);
}

export function canEditReview(createdAt: Date | string, now: Date = new Date()): boolean {
  return now.getTime() < reviewEditableUntil(createdAt).getTime();
}

/**
 * ร้านตอบไปก่อนที่ลูกค้าจะแก้รีวิวไหม — หน้าร้านต้องบอก ไม่งั้นคำตอบจะดูเหมือนตอบข้อความใหม่
 *
 * ไม่ล็อกการแก้หลังร้านตอบ: ร้านจะได้กดตอบทันทีเพื่อ "แช่" รีวิวดี ๆ ไว้ก่อนลูกค้าเจอปัญหา
 * และไม่เปิดให้ร้านตอบซ้ำ: การแก้ไขวนกันไปมาไม่มีที่สิ้นสุด — แค่บอกลำดับเวลาตามจริง
 */
export function repliedBeforeEdit(r: {
  creatorRepliedAt: Date | string | null;
  updatedAt: Date | string | null;
}): boolean {
  if (!r.creatorRepliedAt || !r.updatedAt) return false;
  return new Date(r.creatorRepliedAt).getTime() < new Date(r.updatedAt).getTime();
}

/**
 * ตัวตนของผู้รีวิวที่โชว์บนหน้าร้าน = **ตัวอักษรแรกของชื่อบัญชีเท่านั้น**
 *
 * ตัดสินใจไว้แบบนี้ (ไม่ใช่ handle และไม่มีตัวเลือกให้โชว์ชื่อเต็ม):
 *   - `user.name` มาจากบัญชี Google ซึ่งมักเป็นชื่อจริง (ดู lib/queries/creator.ts)
 *     และผู้ใช้แก้เองในเว็บนี้ไม่ได้ — โชว์เต็มคือเปิดเผยชื่อจริงของคนซื้อ
 *   - ลูกค้าส่วนใหญ่ไม่มี handle (handle เกิดตอนเปิดร้านเท่านั้น) และ handle คือตัวระบุตัวตนเต็ม ๆ
 *   - เดือนที่สั่ง + ตัวอักษรเดียวพอให้รีวิวดูเป็นคนจริง แต่ไม่พอให้คนนอกตามตัวได้
 *
 * ภาษาไทย: ข้ามสระหน้า (เ แ โ ใ ไ) ไปเอาพยัญชนะ — "เอก" ได้ "อ" ไม่ใช่ "เ" ที่อ่านไม่ออก
 * เอาแค่หนึ่ง code point จึงไม่ติดวรรณยุกต์/สระบนล่างมาด้วย และไม่ผ่าคู่ surrogate ของอีโมจิ
 * ชื่อว่างหรือไม่มีตัวอักษรเลย = null ให้หน้าจอเขียนว่า "ลูกค้า" แทน
 */
export function reviewerInitial(name: string | null | undefined): string | null {
  if (!name) return null;
  // for...of เดินทีละ code point — อีโมจิที่เป็นคู่ surrogate ไม่ถูกผ่าครึ่ง
  for (const c of name) {
    if (/[เ-ไ]/u.test(c)) continue;
    if (/[\p{L}\p{N}]/u.test(c)) return c.toLocaleUpperCase();
  }
  return null;
}
