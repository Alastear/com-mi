import type { ThreadEntry } from "@/components/app/order-thread";

type MessageRow = {
  id: string;
  body: string;
  isSystemEvent: boolean;
  eventType: string | null;
  eventData: Record<string, string | number> | null;
  createdAt: Date;
  senderUserId: string | null;
  sender: { name: string; image: string | null } | null;
};

/**
 * แปลงแถว message เป็น DTO ที่ส่งข้ามไปฝั่ง client ได้
 *
 * `Date` serialize ข้าม boundary ไม่ได้ตรง ๆ จึงแปลงเป็น ISO string ที่นี่จุดเดียว
 * ทั้งฝั่งครีเอเตอร์และฝั่งลูกค้าใช้ตัวนี้ร่วมกัน เธรดจะได้ไม่เพี้ยนกันสองแบบ
 */
export function toThreadEntries(messages: MessageRow[]): ThreadEntry[] {
  return messages.map((m) => ({
    id: m.id,
    body: m.body,
    isSystemEvent: m.isSystemEvent,
    eventType: m.eventType,
    eventData: m.eventData,
    createdAt: m.createdAt.toISOString(),
    senderUserId: m.senderUserId,
    senderName: m.sender?.name ?? null,
    senderImage: m.sender?.image ?? null,
  }));
}
