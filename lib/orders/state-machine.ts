import type { OrderStatus } from "@/lib/types";

/**
 * State machine ของออเดอร์ — docs/02-data-model.md §5
 *
 * ทุกการเปลี่ยนสถานะต้องผ่าน `assertTransition()` ที่เดียว ห้ามมี
 * `db.update(order).set({ status })` ลอย ๆ ที่ไหนอีก เพราะสถานะเป็นตัวคุมทั้ง
 * สิทธิ์การดาวน์โหลดไฟล์ การนับโควตา และเงินที่ค้างจ่าย — ถ้าเซ็ตข้ามขั้นได้
 * ลูกค้าจะกดจาก requested ไป delivered แล้วโหลดไฟล์ไปโดยไม่จ่ายเงิน
 *
 * `by` คือ **ใครมีสิทธิ์กด** ไม่ใช่ใครได้ประโยชน์
 *   creator — เจ้าของร้าน
 *   client  — ลูกค้าที่สั่งงาน
 *   system  — cron / งานอัตโนมัติ (เช่น ปิดออเดอร์เองเมื่อครบ 7 วัน)
 */

export type Actor = "creator" | "client" | "system";

type Transition = { to: OrderStatus; by: readonly Actor[] };

const TRANSITIONS: Record<OrderStatus, readonly Transition[]> = {
  requested: [
    { to: "reviewing", by: ["creator"] },
    // instant mode ข้ามการเสนอราคาไปเลย — ราคาตายตัวอยู่แล้ว
    { to: "accepted", by: ["creator"] },
    { to: "declined", by: ["creator"] },
    { to: "cancelled", by: ["client"] },
    { to: "expired", by: ["system"] },
  ],
  reviewing: [
    { to: "quoted", by: ["creator"] },
    { to: "accepted", by: ["creator"] },
    { to: "declined", by: ["creator"] },
    { to: "cancelled", by: ["client"] },
  ],
  quoted: [
    // ลูกค้ายอมรับใบเสนอราคา
    { to: "accepted", by: ["client"] },
    { to: "declined", by: ["creator"] },
    { to: "cancelled", by: ["client"] },
    { to: "expired", by: ["system"] },
  ],
  accepted: [
    { to: "in_progress", by: ["creator"] },
    { to: "cancelled", by: ["creator", "client"] },
  ],
  in_progress: [
    { to: "in_review", by: ["creator"] },
    // ส่งไฟล์จริงเลยโดยไม่ผ่านรอบ WIP ก็ได้ — งานเล็ก ๆ ไม่จำเป็นต้องมี
    { to: "delivered", by: ["creator"] },
    { to: "cancelled", by: ["creator", "client"] },
  ],
  in_review: [
    { to: "revision_requested", by: ["client"] },
    { to: "delivered", by: ["creator"] },
    { to: "cancelled", by: ["creator", "client"] },
  ],
  revision_requested: [
    { to: "in_progress", by: ["creator"] },
    { to: "cancelled", by: ["creator", "client"] },
  ],
  delivered: [
    { to: "completed", by: ["client", "system"] },
    // ลูกค้าทักว่าไฟล์ผิด/ไม่ครบ ยังขอแก้ได้ถ้าโควตารอบแก้ยังเหลือ
    { to: "revision_requested", by: ["client"] },
  ],
  completed: [],
  declined: [],
  cancelled: [],
  expired: [],
};

/** สถานะปลายทาง — ไปต่อไม่ได้แล้ว */
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** สถานะที่ไปต่อได้จากตรงนี้ สำหรับ actor คนนี้ — ใช้ตัดสินว่าจะโชว์ปุ่มอะไรบ้าง */
export function allowedNext(from: OrderStatus, actor: Actor): OrderStatus[] {
  return TRANSITIONS[from].filter((t) => t.by.includes(actor)).map((t) => t.to);
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return TRANSITIONS[from].some((t) => t.to === to && t.by.includes(actor));
}

export class TransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly actor: Actor,
    readonly reason: "not_allowed" | "wrong_actor",
  ) {
    super(`transition ${from} → ${to} by ${actor}: ${reason}`);
    this.name = "TransitionError";
  }
}

/**
 * โยน error ถ้าเปลี่ยนสถานะแบบนี้ไม่ได้
 *
 * แยก `wrong_actor` ออกจาก `not_allowed` เพราะสองอย่างนี้ต้องจัดการต่างกัน:
 * เส้นทางที่ไม่มีอยู่จริงแปลว่าโค้ดฝั่งเราผิด ส่วนผิดคนแปลว่ามีคนพยายามกดของคนอื่น
 * ซึ่งควรถูกบันทึกไว้ดูย้อนหลังได้
 */
export function assertTransition(from: OrderStatus, to: OrderStatus, actor: Actor): void {
  const route = TRANSITIONS[from].find((t) => t.to === to);
  if (!route) throw new TransitionError(from, to, actor, "not_allowed");
  if (!route.by.includes(actor)) throw new TransitionError(from, to, actor, "wrong_actor");
}
