import type { OrderStatus } from "@/lib/types";

/**
 * ชนิดของการแจ้งเตือน
 *
 * เก็บลง DB เป็น key แล้วแปลตอนแสดง — ห้ามเก็บข้อความสำเร็จรูป
 * เหตุผลเดียวกับ `message.eventType`: ครีเอเตอร์ไทยทำอะไรสักอย่าง
 * ลูกค้าที่ใช้อังกฤษต้องเห็นเป็นอังกฤษ และเปลี่ยนภาษาย้อนหลังได้
 */
export const NOTIFICATION_TYPES = [
  "order_created",
  "order_status_changed",
  "order_message",
  "payment_reported",
  "payment_recorded_by_creator",
  "payment_confirmed",
  /** ครีเอเตอร์ตอบว่ายังไม่ได้รับเงินตามที่ลูกค้าแจ้ง — ลูกค้าต้องรู้เพื่อแจ้งใหม่หรือตามเรื่อง */
  "payment_rejected",
  /** ครีเอเตอร์ยกเลิกการยืนยันรับเงิน — ยอดที่ลูกค้าเชื่อว่าจ่ายแล้วถูกหักออก */
  "payment_voided",
  "invite_claimed",
  /**
   * ครีเอเตอร์ยืนยันคำเชิญ ออเดอร์เกิดแล้ว — **ถึงลูกค้า**
   *
   * เดิมใช้ `order_created` ซึ่งเป็นข้อความฝั่งครีเอเตอร์ ("มีคำขอใหม่") ลูกค้าจึงได้
   * แจ้งเตือนว่ามีคำขอใหม่เข้าร้านตัวเอง ทั้งที่ตัวเองไม่มีร้าน และไม่รู้ว่าต้องไปจ่ายเงิน
   */
  "invite_confirmed",
  "quote_issued",
  "quote_accepted",
  "delivery_released",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * ข้อมูลที่ผู้เรียก `notify()` ต้องส่งมา แยกตามชนิด — TS บังคับให้ครบ
 *
 * เก็บเฉพาะสิ่งที่ **หาจากออเดอร์ทีหลังไม่ได้** เช่น ยอดของรายการเงินรายการนั้น
 * หรือสถานะที่เพิ่งเปลี่ยนไป (อีกวินาทีเดียวออเดอร์อาจขยับต่อแล้ว)
 * ชื่อลูกค้า ชื่อร้าน ชื่องาน ยอดรวม — ชั้นอีเมลอ่านเองจากออเดอร์ (lib/email/notify.ts)
 *
 * ⚠️ เดิมเป็น `Record<string, string | number>` เฉย ๆ แต่ละจุดส่งคีย์กันเอง
 * อีเมลคำขอใหม่จึงขึ้น "{client}" ตัวอักษรดิบ กับยอดเงินว่างเปล่า เพราะผู้เรียก
 * ส่งมาแค่ `{code, service}` — ไม่มีอะไรฟ้องเลยจนกว่าจะมีคนเปิดอีเมลอ่าน
 */
export type NotificationData = {
  order_created: { code: string; service: string };
  order_status_changed: { code: string; from: OrderStatus; to: OrderStatus };
  order_message: { code: string; preview: string };
  /** `amount` = ยอดของรายการเงินรายการนี้ (สตางค์) ไม่ใช่ยอดรวมของออเดอร์ */
  payment_reported: { code: string; amount: number };
  payment_recorded_by_creator: { code: string; amount: number };
  payment_confirmed: { code: string; amount: number };
  payment_rejected: { code: string; amount: number };
  payment_voided: { code: string; amount: number };
  invite_claimed: Record<string, never>;
  invite_confirmed: { code: string };
  quote_issued: { code: string };
  quote_accepted: { code: string };
  delivery_released: { code: string };
};
