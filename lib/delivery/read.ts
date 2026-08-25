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
): Promise<{
  open: DeliveryRow | null;
  released: DeliveryRow | null;
  /** ไฟล์จาก **ทุก** รอบที่ปล่อยแล้ว ไม่ใช่แค่รอบล่าสุด */
  releasedFiles: DeliveryFileRow[];
  pendingFiles: DeliveryFileRow[];
}> {
  const db = getDb();

  // ไฟล์ทั้งหมดของออเดอร์นี้ — ใช้ทั้งฝั่งที่ผูกแล้วและยังไม่ผูก
  const media = await db.query.media.findMany({
    where: and(eq(schema.media.orderId, orderId), eq(schema.media.kind, "final")),
    columns: { id: true, filename: true, bytes: true, contentType: true, status: true },
  });

  /**
   * ⚠️ ออเดอร์หนึ่งใบมีการส่งมอบได้ **หลายรอบ** — งานแก้แต่ละครั้งคือแถวใหม่
   * (`attachDelivery` เป็น `insert` ไม่ใช่ `update`)
   *
   * เดิมคืนแค่ `deliveries.at(-1)` แล้วหน้าจอตีความว่า "ส่งมอบของออเดอร์นี้"
   * ซึ่งพังสองทางพร้อมกัน: พอปล่อยรอบแรกไปแล้ว ปุ่มเตรียมส่งซ่อนตัวถาวร
   * (เงื่อนไขคือ `!delivery`) ครีเอเตอร์จึงส่งงานรอบแก้ไม่ได้อีกเลย
   * และพอเตรียมรอบสอง ลูกค้าจะมองไม่เห็นไฟล์รอบแรกที่ซื้อไปแล้วด้วย
   *
   * แยกเป็นสองอย่างแทน: รอบที่ยังเปิดอยู่ (ถ้ามี) กับรอบล่าสุดที่ปล่อยไปแล้ว
   */
  const openRow = [...deliveries].reverse().find((d) => !d.releasedAt) ?? null;
  const releasedRow = [...deliveries].reverse().find((d) => d.releasedAt) ?? null;

  // ไฟล์ที่ถูกผูกกับรอบใดรอบหนึ่งไปแล้ว — ต้องดูทุกรอบ ไม่ใช่แค่รอบล่าสุด
  const attached = new Set(deliveries.flatMap((d) => d.mediaIds));

  /**
   * ⚠️ รวมไฟล์จากทุกรอบที่ปล่อยแล้ว ไม่ใช่เฉพาะรอบล่าสุด
   *
   * ลูกค้าจ่ายเงินไปแล้วสำหรับทุกไฟล์ที่เคยถูกปล่อย พอปล่อยรอบสอง ไฟล์รอบแรก
   * ต้องไม่หายไปจากหน้าจอเขา — ของที่ได้ไปแล้วห้ามหายเพราะมีของใหม่มาแทน
   */
  const releasedIds = new Set(deliveries.filter((d) => d.releasedAt).flatMap((d) => d.mediaIds));
  const releasedFiles = media
    .filter((m) => releasedIds.has(m.id))
    .map((m) => ({
      mediaId: m.id,
      filename: m.filename,
      bytes: m.bytes,
      contentType: m.contentType,
    }));

  return {
    open: openRow ? toDeliveryRow(openRow, media) : null,
    released: releasedRow ? toDeliveryRow(releasedRow, media) : null,
    releasedFiles,
    // ไฟล์ที่อัปแล้วแต่ยังไม่อยู่ในรอบไหนเลย
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
