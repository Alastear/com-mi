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
  "delivery_released",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
