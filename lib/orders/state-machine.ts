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

type Transition = {
  to: OrderStatus;
  by: readonly Actor[];
  /**
   * เส้นทางนี้มีอยู่จริง แต่ **แถบปุ่มธรรมดาต้องไม่แสดง** — ต้องเดินผ่าน action ที่ระบุ
   *
   * มีไว้เพราะบางการเปลี่ยนสถานะต้องเขียนอย่างอื่นพร้อมกันในทรานแซกชันเดียว
   * แล้วปุ่มธรรมดาเขียนแค่ `status` อย่างเดียว (ดู `transitionOrder`)
   * กดปุ่มธรรมดาจึงได้สถานะที่โกหก: บอกว่าเกิดขึ้นแล้วทั้งที่ของจริงยังไม่เกิด
   *
   * เคยเสียเวลากับรูปแบบนี้มาสามครั้ง (ส่งใบเสนอราคาโดยไม่มีใบ, ยอมรับใบโดยไม่พกราคา,
   * และส่งมอบงานโดยไม่ปล่อยไฟล์) จึงทำให้เป็นข้อมูลบนตารางแทนที่จะไปกรองที่หน้าจอ —
   * กรองที่หน้าจอคือมีความจริงสองที่ แล้วมันจะเพี้ยนออกจากกันในที่สุด
   */
  viaAction?: string;
};

/**
 * ⚠️ **ไม่มีเส้นไหนเข้าสู่ `quoted` เลย และห้ามเพิ่ม**
 *
 * `quoted` แปลว่า "มีใบเสนอราคาที่กดยอมรับได้อยู่จริง" ไม่ใช่แค่ป้ายสถานะ
 * `issueQuote()` เป็นตัวเดียวที่เขียนสถานะนี้ และมันเขียนพร้อมแถวใบในทรานแซกชันเดียว
 *
 * ตอนที่เคยมีเส้น `requested → quoted` อยู่ในนี้ แถบปุ่มสร้างปุ่ม "ส่งใบเสนอราคา"
 * ขึ้นมาอีกปุ่มโดยอัตโนมัติ (ทุกปุ่มมาจาก `allowedNext()`) กดแล้วออเดอร์กลายเป็น
 * `quoted` โดยไม่มีใบสักใบ — ลูกค้าเปิดมาเจอ "รอครีเอเตอร์ตอบรับ" ทั้งที่สถานะบอกว่า
 * เสนอราคาไปแล้ว ทั้งคู่จึงนั่งรออีกฝ่ายอยู่คนละหน้าจอ
 */
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
    { to: "accepted", by: ["creator"] },
    { to: "declined", by: ["creator"] },
    { to: "cancelled", by: ["client"] },
  ],
  quoted: [
    /**
     * ⚠️ **ไม่มีเส้น `quoted → accepted` ที่นี่โดยตั้งใจ** — ต้องผ่าน `acceptQuote()` เท่านั้น
     *
     * ปุ่มบนหน้าจอทุกปุ่มมาจาก `allowedNext()` ตัวนี้ ตอนที่ยังมีเส้นนี้อยู่
     * ลูกค้าที่เปิดหน้ามาเจอใบเสนอราคาจะเห็นปุ่มยอมรับ **สองปุ่ม**: ปุ่มบนการ์ด
     * ที่พกราคาไปด้วย กับปุ่มธรรมดาในแถบสถานะที่ไม่พกอะไรเลย
     *
     * กดปุ่มธรรมดา = ออเดอร์เป็น `accepted` ที่ **ราคาเดิมก่อนเสนอ** ใบเสนอราคาถูกทิ้ง
     * และย้อนไม่ได้เลย เพราะ `issueQuote()` ออกใบได้เฉพาะก่อนตอบรับ —
     * ราคาที่ตกลงกันจึงหายไปถาวรจากการกดผิดปุ่มครั้งเดียว
     *
     * เอกสาร docs/06-quotes-and-invites.md เตือนเรื่องนี้ไว้ตั้งแต่ตอนออกแบบว่า
     * "ปุ่มเปลี่ยนสถานะธรรมดาไม่พกราคาไปด้วย" แต่ตอนสร้างจริงลืมปิดทางเก่า
     */
    { to: "declined", by: ["creator"] },
    { to: "cancelled", by: ["client"] },
    { to: "expired", by: ["system"] },
    /**
     * ถอนใบเสนอราคากลับมาคิดใหม่ — ต้องผ่าน `withdrawQuote()` เพราะการถอน
     * ต้องปิดแถวใบพร้อมกับเปลี่ยนสถานะ ปุ่มธรรมดาจะเปลี่ยนแค่สถานะ
     * แล้วเหลือใบที่ยังเปิดอยู่บนออเดอร์ที่ไม่ใช่ `quoted` — ลูกค้าจะกดยอมรับไม่ได้
     * และครีเอเตอร์จะออกใบใหม่ไม่ได้เพราะ index บังคับว่ามีใบเปิดได้ใบเดียว
     */
    { to: "reviewing", by: ["creator"], viaAction: "withdrawQuote" },
  ],
  accepted: [
    { to: "in_progress", by: ["creator"] },
    { to: "cancelled", by: ["creator", "client"] },
  ],
  in_progress: [
    { to: "in_review", by: ["creator"] },
    // ส่งไฟล์จริงเลยโดยไม่ผ่านรอบ WIP ก็ได้ — งานเล็ก ๆ ไม่จำเป็นต้องมี
    { to: "delivered", by: ["creator"], viaAction: "deliverAndRelease" },
    { to: "cancelled", by: ["creator", "client"] },
  ],
  in_review: [
    { to: "revision_requested", by: ["client"] },
    { to: "delivered", by: ["creator"], viaAction: "deliverAndRelease" },
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

/**
 * สถานะที่ไปต่อได้จากตรงนี้ สำหรับ actor คนนี้ — ใช้ตัดสินว่าจะโชว์ปุ่มอะไรบ้าง
 *
 * ตัดเส้นที่มี `viaAction` ออก เพราะปุ่มพวกนั้นต้องมาจากหน้าจอเฉพาะของมัน
 */
export function allowedNext(from: OrderStatus, actor: Actor): OrderStatus[] {
  return TRANSITIONS[from]
    .filter((t) => t.by.includes(actor) && !t.viaAction)
    .map((t) => t.to);
}

/** เส้นทางนี้ต้องเดินผ่าน action เฉพาะไหม — คืนชื่อ action ถ้าใช่ */
export function requiresAction(from: OrderStatus, to: OrderStatus): string | null {
  return TRANSITIONS[from].find((t) => t.to === to)?.viaAction ?? null;
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
