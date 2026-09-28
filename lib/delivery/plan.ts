/**
 * กติกาฝั่งหน้าจอของแผงส่งมอบ — ไฟล์บริสุทธิ์ ไม่มี DB ไม่มี "server-only" จึงเทสต์ด้วย node:test ได้
 *
 * ด่านจริงอยู่ใน `attachDelivery` / `removeDeliveryFile` (lib/delivery/actions.ts) ใต้ lock ของออเดอร์
 * ตรงนี้ตัดสินแค่ว่าจะโชว์ปุ่มอะไร และส่ง id ไหนไปให้ action
 */

/** ผูกไฟล์ได้ครั้งละไม่เกินเท่านี้ — `AttachSchema` ใช้ค่าเดียวกัน */
export const ATTACH_MAX = 30;

/** ตัด id ซ้ำ รักษาลำดับเดิม — id ซ้ำทำให้การนับ "ไฟล์ใช้ได้ครบทุกไฟล์" ใน SQL ไม่ตรงกับจำนวนที่ส่งมา */
export function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export type AttachPlan = { mode: "prepare" | "add"; mediaIds: string[] } | null;

/**
 * ไฟล์ที่ค้างอยู่ (ยังไม่อยู่ในรอบไหน) ควรไปทางไหน
 *
 *   ไม่มีรอบเปิดอยู่ → `prepare` เตรียมรอบใหม่
 *   มีรอบที่เตรียมไว้แต่ยังไม่ปล่อย → `add` เพิ่มเข้ารอบนั้น
 *
 * ⚠️ เดิมหน้าจอซ่อนไฟล์ค้างทั้งหมดทันทีที่มีรอบเปิด (`openRound?.files ?? pendingFiles`)
 * และปุ่มเตรียมโผล่เฉพาะตอน `!openRound` — ไฟล์ที่อัปหลังกดเตรียมจึงหายไปจากจอ
 * และไม่มีทางใส่เข้ารอบได้เลย ครีเอเตอร์ติดอยู่กับชุดเดิม
 *
 * ไม่มีรอบที่สองที่เปิดพร้อมกัน — `attachDelivery` ต่อท้ายรอบที่เปิดอยู่เสมอ
 * รอบที่เปิดซ้อนกันสองรอบ รอบเก่าจะหายจากจอ (read.ts เลือกรอบเปิดล่าสุดรอบเดียว)
 * และไฟล์ในนั้นจะไม่ถูกปล่อยและไม่นับเป็นไฟล์ค้างอีกเลย
 *
 * `uploadable` = สถานะที่ยังแก้ไฟล์ได้ (DELIVERY_UPLOAD_STATUSES) ปิดงานแล้วห้ามแตะรอบ
 */
export function attachPlan(
  pendingIds: readonly string[],
  hasOpenRound: boolean,
  uploadable: boolean,
): AttachPlan {
  if (!uploadable) return null;
  const ids = uniqueIds(pendingIds).slice(0, ATTACH_MAX);
  if (ids.length === 0) return null;
  return { mode: hasOpenRound ? "add" : "prepare", mediaIds: ids };
}
