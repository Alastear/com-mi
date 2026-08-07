import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { OrderStatus } from "@/lib/types";

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
  const template = n[type];
  // ชนิดที่ยังไม่มีข้อความรองรับ — ไม่แสดงดีกว่าโชว์ key ดิบให้ผู้ใช้เห็น
  if (!template) return null;

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const raw = data[key];
    if (raw === undefined) return "";
    // สถานะต้องแปลด้วย ไม่ใช่โชว์ค่าดิบอย่าง "in_progress"
    if (key === "status") return t.orderStatus[String(raw) as OrderStatus] ?? String(raw);
    return String(raw);
  });
}
