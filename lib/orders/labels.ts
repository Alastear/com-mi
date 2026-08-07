import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { OrderStatus } from "@/lib/types";
import type { Actor } from "./state-machine";

/**
 * ปุ่มบน action bar มาจาก `allowedNext()` เสมอ ไม่ใช่รายการที่เขียนตายไว้
 *
 * ถ้า hardcode ปุ่มไว้ วันที่แก้ state machine จะเหลือปุ่มที่กดแล้วเซิร์ฟเวอร์ปฏิเสธ
 * หรือหายไปทั้งที่ยังทำได้ ที่นี่ทำหน้าที่เดียวคือ "สถานะปลายทาง → ข้อความบนปุ่ม"
 *
 * ข้อความต่างกันตามคนกด — ครีเอเตอร์กด `cancelled` คือ "ยกเลิกงาน"
 * ส่วนลูกค้ากด `cancelled` ก็คำเดียวกัน แต่ `completed` ของลูกค้าคือ "ยืนยันรับงาน"
 * ซึ่งครีเอเตอร์กดแทนไม่ได้อยู่แล้ว
 */
export function actionLabel(
  t: Dictionary,
  to: OrderStatus,
  actor: Actor,
): string {
  const a = t.orderAction;
  switch (to) {
    case "reviewing":
      return a.startReview;
    case "quoted":
      return a.sendQuote;
    case "accepted":
      // ครีเอเตอร์ = รับงานเข้าคิว · ลูกค้า = ตอบรับใบเสนอราคา
      return actor === "creator" ? a.acceptOrder : a.markComplete;
    case "in_progress":
      return a.startWork;
    case "in_review":
      return a.submitWip;
    case "delivered":
      return a.deliver;
    case "revision_requested":
      return a.requestRevision;
    case "completed":
      return a.markComplete;
    case "declined":
      return a.decline;
    case "cancelled":
      return a.cancel;
    default:
      return t.order.moveTo;
  }
}

/**
 * ปุ่มไหนควรเป็นปุ่มหลัก — มีได้ปุ่มเดียวเท่านั้น
 *
 * ถ้าทุกปุ่มเด่นเท่ากัน คนจะไม่รู้ว่าปกติควรกดอันไหน และปุ่มทำลาย
 * (ปฏิเสธ/ยกเลิก) ต้องไม่มีวันเป็นปุ่มหลัก ไม่งั้นมีคนกดพลาดแน่นอน
 */
export function isPrimaryAction(to: OrderStatus): boolean {
  return !["declined", "cancelled", "expired"].includes(to);
}

/** ข้อความของ event บน timeline — แปลตอนแสดง ไม่ได้เก็บเป็นข้อความใน DB */
export function eventText(
  t: Dictionary,
  eventType: string | null,
  data: Record<string, string | number> | null,
): string | null {
  if (eventType === "order_created") return t.orderEvent.order_created;
  if (eventType === "status_changed") {
    const to = String(data?.to ?? "") as OrderStatus;
    const label = t.orderStatus[to] ?? to;
    return t.orderEvent.status_changed.replace("{status}", label);
  }
  // event ที่ยังไม่มีข้อความรองรับ — ไม่แสดงดีกว่าโชว์ key ดิบให้ผู้ใช้เห็น
  return null;
}

export function actorText(t: Dictionary, actor: string | undefined): string {
  if (actor === "creator") return t.orderEvent.byCreator;
  if (actor === "client") return t.orderEvent.byClient;
  return t.orderEvent.bySystem;
}
