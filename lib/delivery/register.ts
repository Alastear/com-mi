"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { isOrderCode } from "@/lib/orders/code";
import { partPlan } from "@/lib/storage/keys";
import {
  abortPrivateMultipart,
  completePrivateMultipart,
  deleteObjects,
  headObject,
} from "@/lib/storage/r2";
import { claimIntent, planLimits, storageUsed } from "@/lib/uploads/intent";

/**
 * บันทึกไฟล์ส่งมอบที่เพิ่งอัปโหลดลงตาราง media
 *
 * ⚠️ **ไม่ใช่การต่อยอด `registerMedia`** ตัวนั้นเช็คแค่ `requireCreator()`
 * ซึ่งพิสูจน์แค่ว่า "คนนี้ตั้ง handle แล้ว" ไม่ได้พิสูจน์ว่าเป็นเจ้าของออเดอร์ใบนี้
 * ไฟล์ที่กั้นเงินอยู่ต้องผูกกับออเดอร์ตั้งแต่วินาทีที่บันทึก ไม่ใช่ผูกทีหลัง
 *
 * ออเดอร์ ชื่อไฟล์ ขนาด และ key มาจากคำขออัปโหลดที่ `startDeliveryUpload` บันทึกไว้
 * client ส่งมาแค่ id ของคำขอกับ ETag ของแต่ละชิ้น ซึ่ง R2 ต้องใช้ประกอบไฟล์
 */

const Schema = z.object({
  intentId: z.string().min(1).max(64),
  parts: z
    .array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) }))
    .min(1)
    .max(10_000),
});

export type RegisterDeliveryResult =
  | { ok: true; mediaId: string }
  | { ok: false; error: "forbidden" | "invalid" | "storage_quota_exceeded" | "upload_failed" };

export async function registerDeliveryFile(
  input: z.input<typeof Schema>,
): Promise<RegisterDeliveryResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;
  const userId = session.user.id;

  const intent = await claimIntent(v.intentId, userId, "private");
  if (!intent || intent.kind !== "final" || !intent.orderId || !intent.uploadId) {
    return { ok: false, error: "forbidden" };
  }
  const { key, uploadId } = intent;

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.id, intent.orderId),
    columns: { id: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order || order.page.userId !== userId) return { ok: false, error: "forbidden" };

  /**
   * ต้องครบทุกชิ้นตามที่วางแผนไว้ตอนขอ เรียงเลข 1..n ไม่ขาดไม่ซ้ำ
   * R2 ประกอบไฟล์จากรายการชิ้นที่ส่งไป ถ้ายอมให้ส่งแค่บางชิ้น
   * จะได้ไฟล์ที่ขาดท่อนแต่บันทึกผ่าน — ลูกค้าจ่ายเงินแล้วได้ไฟล์เสีย
   */
  const expected = partPlan(intent.bytes).length;
  const parts = [...v.parts].sort((a, b) => a.partNumber - b.partNumber);
  if (parts.length !== expected || parts.some((p, i) => p.partNumber !== i + 1)) {
    await abortPrivateMultipart(key, uploadId).catch(() => {});
    return { ok: false, error: "invalid" };
  }

  try {
    await completePrivateMultipart({ key, uploadId, parts });
  } catch (err) {
    console.error("[delivery-register] complete", err instanceof Error ? err.message : err);
    await abortPrivateMultipart(key, uploadId).catch(() => {});
    return { ok: false, error: "upload_failed" };
  }

  // ขนาดทุกชิ้นถูกเซ็นไว้ ไฟล์ที่ประกอบแล้วต้องเท่าที่ขอไว้เป๊ะ — ไม่เท่าคือมีอะไรผิดปกติ
  const meta = await headObject("private", key);
  if (!meta || meta.bytes !== intent.bytes) {
    await deleteObjects("private", [key]).catch(() => {});
    return { ok: false, error: "upload_failed" };
  }

  /**
   * ตรวจโควตาซ้ำ — ตอนขอตรวจไปแล้ว แต่อัปหลายไฟล์พร้อมกันทุกคำขอเห็นพื้นที่ว่างเท่ากัน
   * ไบต์ถูกเขียนไปแล้ว ต้องเก็บกวาดเอง ไม่งั้นเหลือไฟล์ค้างที่ไม่มีแถวชี้ถึง
   */
  if ((await storageUsed(userId)) + intent.bytes > planLimits(session.user.plan).storage_bytes) {
    await deleteObjects("private", [key]);
    return { ok: false, error: "storage_quota_exceeded" };
  }

  const mediaId = newId("med");
  await db.insert(schema.media).values({
    id: mediaId,
    ownerUserId: userId,
    orderId: order.id,
    pathname: key,
    /**
     * ไม่มี URL ที่เปิดได้ — ถังส่วนตัวไม่มีโดเมน ทุกการโหลดต้องผ่าน URL ที่เซ็นทีละครั้ง
     * (requestDeliveryDownload) ค่าว่างกันไม่ให้ใครเผลอเอาไปใส่ `<a href>` แล้วคิดว่าใช้ได้
     */
    url: "",
    access: "private",
    kind: "final",
    contentType: intent.contentType,
    bytes: intent.bytes,
    filename: intent.filename.slice(0, 200),
    // ไม่คำนวณ thumbhash ให้ไฟล์ส่งมอบ — ภาพย่อของงานที่ยังไม่จ่ายก็คือการรั่ว
    status: "orphan",
  });

  return { ok: true, mediaId };
}

/** ไฟล์ส่งมอบของออเดอร์นี้ที่ครีเอเตอร์อัปไว้แล้ว (ยังไม่ผูกกับ delivery) */
export async function listDeliveryFiles(code: string) {
  const session = await getSession();
  if (!session || !isOrderCode(code)) return [];

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order || order.page.userId !== session.user.id) return [];

  return db.query.media.findMany({
    where: and(eq(schema.media.orderId, order.id), eq(schema.media.kind, "final")),
    columns: { id: true, filename: true, bytes: true, contentType: true, status: true },
  });
}
