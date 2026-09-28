import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import type { OrderStatus } from "@/lib/types";
import type { Actor } from "./state-machine";

/**
 * โควตารอบแก้ของออเดอร์ — ด่านฝั่ง server กับปุ่มบนหน้าจอใช้ฟังก์ชันชุดนี้ชุดเดียว
 *
 * เดิม `revisionsUsed` โชว์เป็น "0 / N" แต่ไม่มีโค้ดไหนบวกมันเลย ลูกค้าจึงกดขอแก้ได้ไม่จำกัด
 * ทั้งที่หน้าร้านเขียนว่า "แก้ไขได้ N ครั้ง" — ตัวเลขที่ครีเอเตอร์ตั้งไว้ไม่ได้คุมอะไรจริง
 *
 * ⚠️ ห้ามเขียน `used >= allowed` ซ้ำที่อื่น — ถ้าหน้าจอกับด่านคิดคนละสูตร
 * ปุ่มจะโผล่ให้กดแล้วโดนปฏิเสธ หรือหายไปทั้งที่ยังเหลือสิทธิ์
 */

export type RevisionQuota = {
  used: number;
  allowed: number;
  /** ขอแก้ได้อีกกี่ครั้ง — ไม่ติดลบ */
  remaining: number;
  /** ใช้ครบแล้ว หรือเมนูนี้ไม่รวมการแก้ไขตั้งแต่แรก (`allowed` = 0) */
  exhausted: boolean;
};

export function revisionQuota(used: number, allowed: number): RevisionQuota {
  // ค่าเพี้ยน (ติดลบ/NaN) ถือเป็น 0 — ปลอดภัยฝั่งครีเอเตอร์: ไม่มีสิทธิ์ดีกว่าสิทธิ์ไม่จำกัด
  const a = Number.isFinite(allowed) ? Math.max(0, Math.trunc(allowed)) : 0;
  const u = Number.isFinite(used) ? Math.max(0, Math.trunc(used)) : 0;
  return { used: u, allowed: a, remaining: Math.max(0, a - u), exhausted: u >= a };
}

/**
 * การเปลี่ยนสถานะนี้กินโควตารอบแก้ไหม — นับทุกครั้งที่เข้า `revision_requested` ไม่ว่ามาจากไหน
 *
 * ⚠️ ตัดสินแล้วว่า `in_review → revision_requested` (ขอแก้ตอนดูงานระหว่างทำ) **นับด้วย**
 *
 * - `in_review` ไม่ใช่การอัปเดตความคืบหน้าเฉย ๆ ครีเอเตอร์กด "ส่งงานให้ตรวจ" เพื่อเปิดรอบตรวจเอง
 *   สถานะชื่อ "รอลูกค้าตรวจ" และปุ่มของลูกค้าคือ "ขอแก้ไข" ตัวเดียวกับหลังส่งไฟล์จริง
 *   ปุ่มเดียวกันแต่นับบ้างไม่นับบ้าง ลูกค้าจะเดาไม่ออกว่ากดแล้วเสียสิทธิ์หรือเปล่า
 * - หน้าร้านสัญญาว่า "แก้ไขได้ N ครั้ง" โดยไม่แยกช่วง และ docs/00 Loop 4 ออกแบบไว้ว่า
 *   ขอแก้ตอน WIP นับโควตา ธรรมเนียมคอมมิชชันก็นับรอบแก้ช่วงสเก็ตช์เป็นหลัก
 *   เพราะเป็นช่วงที่แก้ได้ถูกที่สุด
 * - ถ้าไม่นับ วง in_progress → in_review → revision_requested → in_progress วนได้ไม่จำกัด
 *   โควตาจะคุมแค่หลังส่งไฟล์จริง ซึ่งเป็นช่วงที่ขอแก้กันน้อยที่สุด — ไม่แฟร์กับครีเอเตอร์
 * - กันลูกค้าตกใจด้วยการบอกก่อนกดเสมอ: ข้างปุ่มเขียนว่าเหลือกี่ครั้งและกดแล้วนับ 1 ครั้ง
 *   (`revisionHint`) ติชมในแชทไม่ผ่านปุ่มนี้จึงไม่ถูกนับ — จะทำตามหรือไม่เป็นเรื่องที่ตกลงกันเอง
 */
export function consumesRevision(to: OrderStatus, actor: Actor): boolean {
  // ครีเอเตอร์เปิดรอบแก้เอง (แก้ไฟล์ผิดของตัวเอง) ไม่นับสิทธิ์ของลูกค้า — ดู state-machine.ts
  return to === "revision_requested" && actor === "client";
}

/**
 * ข้อความข้างปุ่มขอแก้ไขฝั่งลูกค้า
 *
 * `blocked` = ต้องเอาปุ่มออกแล้วโชว์ข้อความแทน — ถ้ายังโชว์ปุ่ม ลูกค้าจะกดแล้วเจอ error
 * ทั้งที่รู้อยู่แล้วว่ากดไม่ได้
 *
 * แยก `allowed` = 0 ออกจาก "ใช้ครบแล้ว" เพราะลูกค้าไม่เคยใช้สิทธิ์สักครั้ง
 * บอกว่า "ใช้ครบ 0/0 ครั้งแล้ว" จะฟังเหมือนระบบกินสิทธิ์ไปเอง
 *
 * ⚠️ ยังไม่มีการซื้อรอบแก้เพิ่ม (เป็นฟีเจอร์ภายหลัง) ข้อความจึงพาไปคุยในแชทเท่านั้น
 * อย่าเขียนว่า "ซื้อเพิ่มได้" จนกว่าจะมีปุ่มนั้นจริง
 */
export function revisionHint(
  t: Dictionary,
  quota: RevisionQuota,
): { blocked: boolean; text: string } {
  const a = t.orderAction;
  if (quota.allowed === 0) return { blocked: true, text: a.revisionsNone };
  if (quota.exhausted) {
    return {
      blocked: true,
      text: fill(a.revisionsExhausted, { used: quota.used, total: quota.allowed }),
    };
  }
  return {
    blocked: false,
    text: fill(a.revisionsLeft, { n: quota.remaining, total: quota.allowed }),
  };
}
