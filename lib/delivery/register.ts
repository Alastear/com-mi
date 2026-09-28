"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { canUploadDelivery, DELIVERY_UPLOAD_STATUSES } from "@/lib/delivery/path";
import { lockOrder } from "@/lib/orders/lock";
import { isOrderCode } from "@/lib/orders/code";
import { MAX_FILENAME_LENGTH, partPlan } from "@/lib/storage/keys";
import {
  abortPrivateMultipart,
  completePrivateMultipart,
  deleteObjects,
  headObject,
  isClientError,
} from "@/lib/storage/r2";
import {
  affectedRows,
  claimHeld,
  claimIntent,
  closeIntent,
  lockStorage,
  planLimits,
  registeredMediaId,
  releaseIntent,
  withinQuotaSql,
  type UploadIntent,
} from "@/lib/uploads/intent";
import { STALE_CLAIM_MS } from "@/lib/uploads/register-retry";

/**
 * บันทึกไฟล์ส่งมอบที่เพิ่งอัปโหลดลงตาราง media
 *
 * ⚠️ **ไม่ใช่การต่อยอด `registerMedia`** ตัวนั้นเช็คแค่ `requireCreator()`
 * ซึ่งพิสูจน์แค่ว่า "คนนี้ตั้ง handle แล้ว" ไม่ได้พิสูจน์ว่าเป็นเจ้าของออเดอร์ใบนี้
 * ไฟล์ที่กั้นเงินอยู่ต้องผูกกับออเดอร์ตั้งแต่วินาทีที่บันทึก ไม่ใช่ผูกทีหลัง
 *
 * ออเดอร์ ชื่อไฟล์ ขนาด และ key มาจากคำขออัปโหลดที่ `startDeliveryUpload` บันทึกไว้
 * client ส่งมาแค่ id ของคำขอกับ ETag ของแต่ละชิ้น ซึ่ง R2 ต้องใช้ประกอบไฟล์
 *
 * เรียกซ้ำได้อย่างปลอดภัย (lib/uploads/client.ts ลองซ้ำเมื่อเน็ตหลุด):
 *   - รอบก่อนสำเร็จแต่คำตอบหาย → ได้ `mediaId` เดิมคืน ไม่ได้แถวที่สอง
 *   - รอบก่อนล้มเพราะเรื่องชั่วคราว → คำขอถูกคืนสิทธิ์ (`releaseIntent`) บันทึกต่อได้
 *     โดยไม่ต้องอัปไฟล์ 2 GB ใหม่ — ชิ้นที่ส่งไปแล้วยังอยู่ ไม่ถูกยกเลิกทิ้ง
 *   - รอบก่อนยังถือคำขออยู่ (ยังวิ่ง หรือตายไปโดยคืนสิทธิ์ไม่ทัน) → `busy` ลองต่อได้
 *     ถ้าตายจริง ค้างครบ `STALE_CLAIM_MS` แล้วครั้งถัดไป claim ต่อได้เอง
 *   - ล้มถาวร → คำขอถูกปิด (`closeIntent`) ครั้งถัดไปได้ `forbidden` ทันที ไม่ต้องรอ
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
  | {
      ok: false;
      /**
       * `retry` = ล้มเพราะเรื่องชั่วคราว คำขอยังใช้ได้ เรียกซ้ำด้วยค่าเดิมได้เลย
       * `busy`  = การเรียกอื่นถือคำขออยู่ เรียกซ้ำทีหลังได้ (ไฟล์ยังไม่หาย)
       * `forbidden` = คำขอนี้ใช้ไม่ได้แล้ว (ไม่มี ไม่ใช่ของเรา หมดอายุ ถูกยกเลิก) — ต้องอัปใหม่
       */
      error: "forbidden" | "invalid" | "invalid_state" | "storage_quota_exceeded" | "upload_failed" | "retry" | "busy";
    };

export async function registerDeliveryFile(
  input: z.input<typeof Schema>,
): Promise<RegisterDeliveryResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;
  const userId = session.user.id;

  const intent = await claimIntent(v.intentId, userId, "private", { reclaimStaleAfterMs: STALE_CLAIM_MS });
  if (!intent) {
    // ถูกใช้ไปแล้ว — ถ้าเป็นเพราะรอบก่อนบันทึกสำเร็จ ตอบแถวเดิม
    const done = await registeredMediaId(v.intentId, userId);
    if (done) return { ok: true, mediaId: done };
    /**
     * ⚠️ แยก "มีคนถืออยู่" ออกจาก "ใช้ไม่ได้แล้ว" — เบราว์เซอร์ลองต่อเฉพาะ `busy`
     * ตอบ `forbidden` ทั้งสองกรณี (แบบเดิม) ทำให้ต้องเดาจากฝั่งเบราว์เซอร์ และเดาผิดได้ทั้งสองทาง:
     * ทิ้งไฟล์ที่ยังบันทึกได้ หรือบอกว่า "ไฟล์ยังไม่หาย" กับคำขอที่ตายไปแล้ว
     */
    return (await claimHeld(v.intentId, userId, "private"))
      ? { ok: false, error: "busy" }
      : { ok: false, error: "forbidden" };
  }
  if (intent.kind !== "final" || !intent.orderId || !intent.uploadId) {
    return { ok: false, error: "forbidden" };
  }

  try {
    const res = await registerClaimed(intent as ClaimedIntent, v.parts, userId, session.user.plan);
    /**
     * ทุกผลที่ไม่ผ่านจาก `registerClaimed` เป็นล้มถาวร (ไฟล์ถูกทิ้งไปแล้ว) — ปิดคำขอด้วย
     * ถ้าคำตอบนี้หายกลางทาง ครั้งถัดไปจะได้ `forbidden` ทันที แทนที่จะได้ `busy` ไปอีกสิบกว่านาที
     * ปิดไม่ได้ก็ไม่เป็นไร: ค้างครบ `STALE_CLAIM_MS` แล้ว claim ต่อ ก็ได้คำตอบเดิม
     */
    if (!res.ok) await closeIntent(intent.id, userId).catch(() => {});
    return res;
  } catch (err) {
    /**
     * ล้มกลางทางด้วยเหตุที่ไม่ได้ตั้งใจ (Neon/R2 สะดุด เน็ตของ function หลุด) — คืนสิทธิ์คำขอ
     * ให้เบราว์เซอร์ลองใหม่ได้ ปลอดภัยแม้ insert อาจ commit ไปแล้ว — ดู `releaseIntent`
     *
     * ⚠️ Neon ที่ล่มจนงานบันทึกล้ม มักยังล่มอยู่ตอนคืนสิทธิ์ (query ถัดไปทันที) จึงลองคืนซ้ำ
     * สั้น ๆ ราว 15 วินาที ถ้ายังไม่ได้ คำขอค้างเป็นใช้แล้ว — ไม่ถาวร: ครบ `STALE_CLAIM_MS`
     * แล้วครั้งถัดไปของเบราว์เซอร์ claim ต่อได้เอง (ระหว่างนั้นได้ `busy`) ไม่ต้องอัปใหม่
     */
    console.error("[delivery-register]", err instanceof Error ? err.message : err);
    if (!(await releaseWithRetry(intent.id, userId))) {
      console.error("[delivery-register] release failed — intent reclaimable after STALE_CLAIM_MS", intent.id);
    }
    return { ok: false, error: "retry" };
  }
}

/** รอก่อนลองคืนสิทธิ์ครั้งถัดไป — รวมราว 15 วินาที พอสำหรับ Neon สะดุดครู่เดียว */
const RELEASE_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

async function releaseWithRetry(id: string, userId: string): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try {
      await releaseIntent(id, userId);
      return true;
    } catch {
      if (attempt >= RELEASE_BACKOFF_MS.length) return false;
      await new Promise((r) => setTimeout(r, RELEASE_BACKOFF_MS[attempt]));
    }
  }
}

type ClaimedIntent = UploadIntent & { orderId: string; uploadId: string };

async function registerClaimed(
  intent: ClaimedIntent,
  rawParts: Array<{ partNumber: number; etag: string }>,
  userId: string,
  plan: string | null | undefined,
): Promise<RegisterDeliveryResult> {
  const { key, uploadId } = intent;
  const db = getDb();

  /**
   * รอบก่อน insert commit ไปแล้วแต่คำตอบหาย (แล้วคำขอถูกคืนสิทธิ์) — ตอบแถวเดิมก่อนทำอะไรทั้งนั้น
   * ⚠️ ต้องมาก่อนทุกทางที่ทิ้งไฟล์ด้านล่าง ไม่งั้นลองซ้ำตอนออเดอร์เพิ่งปิดจะลบไฟล์ที่บันทึกไปแล้ว
   * หลังบรรทัดนี้ไม่มีใครสร้างแถวให้ key นี้ได้อีก นอกจากการเรียกครั้งนี้ (เราถือคำขอไว้)
   */
  const existing = await db.query.media.findFirst({
    columns: { id: true, ownerUserId: true },
    where: eq(schema.media.pathname, key),
  });
  if (existing) {
    return existing.ownerUserId === userId ? { ok: true, mediaId: existing.id } : { ok: false, error: "forbidden" };
  }

  /** ทิ้งทั้ง multipart ที่ค้างและไฟล์ที่อาจประกอบเสร็จแล้ว (กรณีลองซ้ำหลังประกอบสำเร็จ) */
  const discard = async () => {
    await abortPrivateMultipart(key, uploadId).catch(() => {});
    await deleteObjects("private", [key]).catch(() => {});
  };

  const order = await db.query.order.findFirst({
    where: eq(schema.order.id, intent.orderId),
    columns: { id: true, status: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order || order.page.userId !== userId) {
    await discard();
    return { ok: false, error: "forbidden" };
  }
  /**
   * ⚠️ เช็คสถานะซ้ำตอนบันทึก — คำขอมีอายุหลายชั่วโมง ระหว่างนั้นลูกค้าอาจกดรับงาน
   * ออเดอร์ถูกยกเลิก หรือหมดอายุไปแล้ว ไฟล์ที่ขึ้นมาหลังปิดคือการแก้หลักฐานที่ปิดไปแล้ว
   * (และเป็นไฟล์ที่ไม่มีทางถูกส่งมอบหรือถูกลบ กินโควตาตลอดไป)
   * นี่คือคำตอบให้ตรงเรื่อง ด่านจริงอยู่ใน insert ใต้ lock ด้านล่าง
   */
  if (!canUploadDelivery(order.status)) {
    await discard();
    return { ok: false, error: "invalid_state" };
  }

  /**
   * ต้องครบทุกชิ้นตามที่วางแผนไว้ตอนขอ เรียงเลข 1..n ไม่ขาดไม่ซ้ำ
   * R2 ประกอบไฟล์จากรายการชิ้นที่ส่งไป ถ้ายอมให้ส่งแค่บางชิ้น
   * จะได้ไฟล์ที่ขาดท่อนแต่บันทึกผ่าน — ลูกค้าจ่ายเงินแล้วได้ไฟล์เสีย
   */
  const expected = partPlan(intent.bytes).length;
  const parts = [...rawParts].sort((a, b) => a.partNumber - b.partNumber);
  if (parts.length !== expected || parts.some((p, i) => p.partNumber !== i + 1)) {
    await discard();
    return { ok: false, error: "invalid" };
  }

  try {
    await completePrivateMultipart({ key, uploadId, parts });
  } catch (err) {
    /**
     * ประกอบไฟล์ไม่ผ่าน — แยกให้ออกก่อนว่าไฟล์ขึ้นแล้วหรือยัง
     * รอบก่อนประกอบสำเร็จแต่ล้มทีหลัง (หรือคำตอบของ R2 หาย) ลองซ้ำจะได้ NoSuchUpload
     * ทั้งที่ไฟล์อยู่ครบในถังแล้ว — กรณีนั้นเดินต่อได้เลย
     */
    const meta = await headObject("private", key);
    if (!meta || meta.bytes !== intent.bytes) {
      // 4xx = ETag ไม่ตรง ชิ้นขาด หรือ upload ถูกยกเลิกไปแล้ว ลองกี่ครั้งก็ไม่ผ่าน
      if (isClientError(err)) {
        console.error("[delivery-register] complete", err instanceof Error ? err.message : err);
        await discard();
        return { ok: false, error: "upload_failed" };
      }
      // 5xx / เน็ต — ห้ามยกเลิก ชิ้นทั้งหมดยังใช้ได้ ให้ด้านนอกคืนสิทธิ์แล้วลองใหม่
      throw err;
    }
  }

  // ขนาดทุกชิ้นถูกเซ็นไว้ ไฟล์ที่ประกอบแล้วต้องเท่าที่ขอไว้เป๊ะ — ไม่เท่าคือมีอะไรผิดปกติ
  const meta = await headObject("private", key);
  if (!meta || meta.bytes !== intent.bytes) {
    await deleteObjects("private", [key]).catch(() => {});
    return { ok: false, error: "upload_failed" };
  }

  /**
   * insert แบบมีเงื่อนไข ใต้ lock ของออเดอร์และของโควตา — ด่านจริงของทั้งสามเรื่อง
   *
   *   ออเดอร์ยังอยู่ในสถานะที่รับไฟล์ — เช็คด้านบนเป็นแค่คำตอบให้ตรงเรื่อง ออเดอร์อาจถูกปิด
   *     ระหว่างที่ R2 ประกอบไฟล์อยู่ ใต้ `lockOrder` การปิดต้องรอจนเราจบ
   *   ไม่เกินโควตา — เดิมอ่านยอดแล้วค่อย insert สองแท็บ (หรือสคริปต์) บันทึกพร้อมกัน
   *     ต่างเห็นยอดเดิมและผ่านทั้งหมด ได้ N เท่าของโควตาถาวร
   *   ยังไม่มีแถวไหนชี้ key นี้ — การลองซ้ำหลังคำตอบหายต้องไม่ได้แถวที่สอง
   *
   *   คำขอยังไม่ถูกปิดตั้งแต่เรา claim — `expires_at` ไม่ถูกลดลง (ดู `intentLive` ข้างล่าง)
   *
   * ลำดับล็อก: ออเดอร์ก่อน แล้วค่อยโควตา (กติกาใน lib/orders/lock.ts)
   *
   * `url` ว่าง — ถังส่วนตัวไม่มีโดเมน ทุกการโหลดต้องผ่าน URL ที่เซ็นทีละครั้ง
   * (requestDeliveryDownload) ค่าว่างกันไม่ให้ใครเผลอเอาไปใส่ `<a href>` แล้วคิดว่าใช้ได้
   * ไม่คำนวณ thumbhash ให้ไฟล์ส่งมอบ — ภาพย่อของงานที่ยังไม่จ่ายก็คือการรั่ว
   */
  const mediaId = newId("med");
  /**
   * ⚠️ คำขอต้องยังเป็นของเราอยู่ **ตอน insert** ไม่ใช่แค่ตอน claim
   *
   * รอบก่อน insert commit ไปแล้วแต่ Neon โยน error → คืนสิทธิ์ → เบราว์เซอร์ลองซ้ำ (claim ได้อีก)
   * ระหว่างนั้นครีเอเตอร์ลบไฟล์นี้จากอีกแท็บ: `removeDeliveryFile` ลบแถว + ปิดคำขอ ("ป้ายหลุมศพ" ที่ลด
   * `expires_at` ลงเป็น now) แล้วลบไฟล์ใน R2 — ถ้าการลองซ้ำผ่านเช็ค `existing` ด้านบนไปก่อนแถวถูกลบ
   * แล้ว insert ตรงนี้ได้ จะเกิดแถวใหม่ชี้ไฟล์ที่กำลังจะหาย ครีเอเตอร์ส่งมอบไปแล้วลูกค้าโหลดได้ 404
   * `removeDeliveryFile` ถือ `lockOrder` เดียวกัน การลบกับ insert นี้จึงเรียงกันเสมอ — ถ้าลบมาก่อน
   * WHERE นี้เห็นป้ายแล้วไม่ insert
   *
   * เทียบกับค่าที่ claim ได้ ไม่ใช่ `> now()` — คำขอที่หมดอายุเองระหว่างที่เราประกอบไฟล์อยู่ (เราถือมันอยู่)
   * ยังบันทึกได้ ที่ห้ามคือคำขอที่ **มีคนปิด** (`closeIntent` / ป้ายหลุมศพ ต่างก็ลด `expires_at`)
   * ตัดที่มิลลิวินาทีให้ตรงกับ `Date` ของ JS (เหตุผลเดียวกับ lib/orders/version.ts)
   */
  const intentLive = sql`exists (
    select 1 from upload_intent i
    where i.id = ${intent.id} and i.user_id = ${userId}
      and date_trunc('milliseconds', i.expires_at) >= ${intent.expiresAt.toISOString()}::timestamptz
  )`;
  const statuses = sql.join(
    DELIVERY_UPLOAD_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  const [, , inserted] = await db.batch([
    lockOrder(intent.orderId),
    lockStorage(userId),
    db.execute(sql`
      insert into media
        (id, owner_user_id, order_id, pathname, url, access, kind, content_type, bytes, filename, status)
      select ${mediaId}::text, ${userId}::text, ${intent.orderId}::text, ${key}::text,
             ''::text, 'private'::text, 'final'::text, ${intent.contentType}::text,
             ${intent.bytes}::int, ${intent.filename.slice(0, MAX_FILENAME_LENGTH)}::text, 'orphan'::text
      where exists (select 1 from "order" o where o.id = ${intent.orderId} and o.status in (${statuses}))
        and not exists (select 1 from media m where m.pathname = ${key})
        and ${intentLive}
        and ${withinQuotaSql(userId, intent.bytes, planLimits(plan).storage_bytes)}
      returning id
    `),
  ]);
  if (affectedRows(inserted) > 0) return { ok: true, mediaId };

  /**
   * ไม่ผ่าน — ดูของจริงอีกรอบแล้วตอบให้ตรงเรื่อง
   * ⚠️ เช็คแถวที่ชี้ key นี้ซ้ำก่อนลบไฟล์ — ไม่ควรมีได้ (เราถือคำขอไว้) แต่ถ้ามี
   * การลบคือไฟล์ส่งมอบที่บันทึกแล้วหายถาวร ถูกกว่ามากที่จะเช็คอีกหนึ่ง query
   */
  const raced = await db.query.media.findFirst({
    columns: { id: true, ownerUserId: true },
    where: eq(schema.media.pathname, key),
  });
  if (raced) {
    return raced.ownerUserId === userId ? { ok: true, mediaId: raced.id } : { ok: false, error: "forbidden" };
  }
  // ไบต์ถูกเขียนไปแล้ว ต้องเก็บกวาดเอง ไม่งั้นเหลือไฟล์ค้างที่ไม่มีแถวชี้ถึง
  await deleteObjects("private", [key]).catch(() => {});
  // คำขอถูกปิดระหว่างทาง (ลบไฟล์นี้จากอีกแท็บ) — ไม่ใช่เรื่องโควตาหรือสถานะ ต้องอัปใหม่ถ้ายังต้องการไฟล์
  const still = await db.query.uploadIntent.findFirst({
    columns: { expiresAt: true },
    where: and(eq(schema.uploadIntent.id, intent.id), eq(schema.uploadIntent.userId, userId)),
  });
  if (!still || still.expiresAt.getTime() < intent.expiresAt.getTime()) return { ok: false, error: "forbidden" };
  const fresh = await db.query.order.findFirst({
    where: eq(schema.order.id, intent.orderId),
    columns: { status: true },
  });
  return { ok: false, error: fresh && canUploadDelivery(fresh.status) ? "storage_quota_exceeded" : "invalid_state" };
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
