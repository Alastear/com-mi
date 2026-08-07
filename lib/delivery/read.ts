import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { toDeliveryRow, type DeliveryFileRow, type DeliveryRow } from "./rows";

/**
 * อ่านข้อมูลไฟล์ส่งมอบสำหรับหน้าออเดอร์
 *
 * แยกจาก query หลักเพราะต้องอ่าน `media` ตามรายการ id ที่อยู่ใน `delivery.mediaIds`
 * (jsonb array) ซึ่ง relational query ของ Drizzle join ให้ไม่ได้
 */
export async function readDelivery(
  orderId: string,
  deliveries: {
    id: string;
    note: string;
    licenseType: string;
    releasedAt: Date | null;
    mediaIds: string[];
  }[],
): Promise<{ delivery: DeliveryRow | null; pendingFiles: DeliveryFileRow[] }> {
  const db = getDb();

  // ไฟล์ทั้งหมดของออเดอร์นี้ — ใช้ทั้งฝั่งที่ผูกแล้วและยังไม่ผูก
  const media = await db.query.media.findMany({
    where: and(eq(schema.media.orderId, orderId), eq(schema.media.kind, "final")),
    columns: { id: true, filename: true, bytes: true, contentType: true, status: true },
  });

  const latest = deliveries.at(-1) ?? null;
  const attached = new Set(latest?.mediaIds ?? []);

  return {
    delivery: latest ? toDeliveryRow(latest, media) : null,
    // ไฟล์ที่อัปแล้วแต่ยังไม่อยู่ในการส่งมอบชุดล่าสุด
    pendingFiles: media
      .filter((m) => !attached.has(m.id))
      .map((m) => ({
        mediaId: m.id,
        filename: m.filename,
        bytes: m.bytes,
        contentType: m.contentType,
      })),
  };
}

export { inArray };
