import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { OrderStatus } from "@/lib/types";
import { closedEarly } from "@/lib/orders/state-machine";

/**
 * แปลงแจ้งเตือนเป็นข้อความตามภาษาของคนอ่าน
 *
 * เหตุผลเดียวกับ `eventText` ของ timeline — DB เก็บ key ไม่ใช่ประโยค
 * คนละคนอ่านคนละภาษาจากแถวเดียวกันได้ และเปลี่ยนคำทีหลังได้โดยไม่ต้อง migrate
 */
export function notificationText(
  t: Dictionary,
  type: string,
  data: Record<string, string | number>,
): string | null {
  const n = t.notification as Record<string, string>;
  /**
   * ลูกค้าปิดงานระหว่างรอบแก้ — "งาน #X เปลี่ยนเป็น เสร็จสมบูรณ์" ไม่บอกว่ารอบแก้ที่ครีเอเตอร์อาจกำลังทำอยู่
   * ไม่ต้องส่งแล้ว เงื่อนไขเดียวกับอีเมล (`closedEarly`) แถวเก่าที่ไม่มี `from` ใช้ข้อความเดิม
   */
  const early =
    type === "order_status_changed" && closedEarly(String(data.from ?? ""), String(data.to ?? ""));
  const template = early ? n.orderClosedEarly : n[type];
  // ชนิดที่ยังไม่มีข้อความรองรับ — ไม่แสดงดีกว่าโชว์ key ดิบให้ผู้ใช้เห็น
  if (!template) return null;

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    /**
     * ⚠️ `transitionOrder()` เก็บสถานะใหม่ไว้ที่ `to` (พร้อม `from`) ไม่ใช่ `status`
     * ข้อความใช้ `{status}` มาตั้งแต่แรก กระดิ่งจึงขึ้น "งาน #X เปลี่ยนเป็น " ท้ายว่างมาตลอด
     * แถวที่อยู่ใน DB แล้วแก้ย้อนไม่ได้ จึงอ่าน `to` แทนตรงนี้ — แถวเก่าที่มี `status` ก็ยังอ่านได้
     */
    const raw = key === "status" ? (data.status ?? data.to) : data[key];
    if (raw === undefined) return "";
    // สถานะต้องแปลด้วย ไม่ใช่โชว์ค่าดิบอย่าง "in_progress"
    if (key === "status") return t.orderStatus[String(raw) as OrderStatus] ?? String(raw);
    return String(raw);
  });
}
