"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { canUploadDelivery, deliveryPrefix } from "@/lib/delivery/path";
import { PUBLIC_MEDIA_KINDS } from "@/lib/media/kinds";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/media/prepare";
import { ACCEPTED_VIDEO_TYPES, MAX_VIDEO_BYTES } from "@/lib/media/video";
import { isOrderCode } from "@/lib/orders/code";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import {
  MAX_DELIVERY_BYTES,
  MAX_FILENAME_LENGTH,
  PART_SIZE,
  partPlan,
  publicKey,
  safeContentType,
} from "@/lib/storage/keys";
import {
  abortPrivateMultipart,
  deleteObjects,
  presignPublicPut,
  startPrivateMultipart,
} from "@/lib/storage/r2";
import {
  affectedRows,
  DELIVERY_INTENT_TTL_MS,
  lockStorage,
  MEDIA_INTENT_TTL_MS,
  planLimits,
  withinQuotaSql,
} from "./intent";

/**
 * ขออนุญาตอัปโหลด — ด่านเดียวที่เซิร์ฟเวอร์เห็นก่อนไฟล์ถูกเขียน
 *
 * ไฟล์ไม่วิ่งผ่าน function ของเรา เบราว์เซอร์ PUT ตรงไป R2 ด้วย URL ที่เซ็นให้
 * (ไม่ชนเพดาน body 4.5 MB ของ Vercel และไม่เสียค่า transfer สองต่อ)
 * ทุกการตรวจ — สิทธิ์ ชนิด ขนาด โควตา — จึงต้องจบที่นี่ ก่อนออก URL
 *
 * ขนาดที่ขอถูกเซ็นลงใน URL ขนาดจริงต่างไปแม้ไบต์เดียว R2 ตอบ 403
 * โควตาที่ตรวจตรงนี้จึงเชื่อได้ ไม่ใช่แค่ตัวเลขที่ client บอกมา
 *
 * ⚠️ ถังเป็นคุณสมบัติของ action ไม่ใช่ของ input — สอง action สองถัง
 * ไม่มีค่าไหนจาก client ที่ทำให้ไฟล์ส่งมอบไปลงถังสาธารณะได้
 */

export type StartUploadError =
  | "forbidden"
  | "invalid"
  | "invalid_state"
  | "too_large"
  | "storage_quota_exceeded"
  | "rate_limited"
  | "upload_failed";

type Fail = { ok: false; error: StartUploadError };
const fail = (error: StartUploadError): Fail => ({ ok: false, error });

/* ── ไฟล์สาธารณะ: รูปหน้าร้าน ผลงาน ปกเมนู ─────────────────────── */

const MediaSchema = z.object({
  kind: z.enum(PUBLIC_MEDIA_KINDS),
  contentType: z.string().max(100),
  bytes: z.number().int().positive(),
});

export type StartMediaUploadResult =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | Fail;

export async function startMediaUpload(
  input: z.input<typeof MediaSchema>,
): Promise<StartMediaUploadResult> {
  const session = await getSession();
  // ต้องเปิดร้านแล้ว — ด่านเดียวกับ `registerMedia` ที่จะบันทึกไฟล์นี้
  if (!session?.user.handle) return fail("forbidden");

  const parsed = MediaSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { kind, contentType, bytes } = parsed.data;
  const userId = session.user.id;
  const limits = planLimits(session.user.plan);

  /**
   * ⚠️ มี handle ยังไม่พอ ต้องมีหน้าร้านจริงด้วย — onboarding ที่ล้มกลางคัน (ตั้ง handle แล้ว
   * แต่สร้างร้านไม่ทัน ดู lib/shop/ensure.ts) ทำให้มีคนที่มี handle แต่ไม่มี `creator_page`
   * คนกลุ่มนี้ผูกไฟล์กับอะไรไม่ได้เลย (setShopImage / addPortfolioItem / setServiceCover
   * ต้องมีร้านทั้งหมด) เดิมกลับได้ URL อัปขึ้นถังสาธารณะ = ที่ฝากไฟล์ให้ใครก็เปิดได้
   * ไม่มีร้าน กับไม่มีสิทธิ์ ตอบเหมือนกัน
   */
  const page = await getDb().query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.userId, userId),
  });
  if (!page) return fail("forbidden");

  /**
   * รูปถูกย่อและแปลงเป็น WebP ในเบราว์เซอร์มาแล้วเสมอ ส่วนวิดีโอตัวอย่าง **ไม่ถูกแปลง**
   * (transcode ในเบราว์เซอร์กินเวลาหลายนาทีบนมือถือและผลไม่แน่นอน)
   * จึงคุมด้วยขนาดกับความยาวแทน และรับเฉพาะพอร์ตโฟลิโอ
   */
  const isVideo = kind === "portfolio" && ACCEPTED_VIDEO_TYPES.includes(contentType);
  if (contentType !== "image/webp" && !isVideo) return fail("invalid");
  const max = isVideo
    ? Math.min(limits.file_size_bytes * 2, MAX_VIDEO_BYTES)
    : Math.min(limits.file_size_bytes, MAX_IMAGE_UPLOAD_BYTES);
  if (bytes > max) return fail("too_large");

  const gate = await rateLimit(
    `media-upload:${userId}`,
    LIMITS.mediaUpload.limit,
    LIMITS.mediaUpload.windowSeconds,
  );
  if (!gate.ok) return fail("rate_limited");

  const intentId = newId("upl");
  // key สุ่มฝั่งเรา — เบราว์เซอร์ไม่มีสิทธิ์เลือก path เอง
  const key = publicKey(kind, crypto.randomUUID(), contentType);
  try {
    const signed = await presignPublicPut({ key, contentType, bytes });
    const ok = await insertIntentWithinQuota({
      id: intentId,
      userId,
      bucket: "public",
      key,
      kind,
      orderId: null,
      contentType,
      bytes,
      filename: "",
      uploadId: null,
      ttlMs: MEDIA_INTENT_TTL_MS,
      limit: limits.storage_bytes,
    });
    // แพ้การแข่งกับคำขออื่นของคนเดียวกัน — URL ที่เซ็นไปแล้วไม่ได้ส่งออกไป ทิ้งได้เลย
    if (!ok) return fail("storage_quota_exceeded");
    return { ok: true, intentId, ...signed };
  } catch (err) {
    console.error("[uploads] start media", err instanceof Error ? err.message : err);
    return fail("upload_failed");
  }
}

/**
 * บันทึกคำขออัปโหลดเฉพาะเมื่อยังไม่เกินโควตา — **ด่านจริงของโควตาตอนขอ**
 *
 * เดิมอ่านยอดก่อนแล้วค่อย insert คำขอที่วิ่งพร้อมกันเห็นพื้นที่ว่างเท่ากันหมดแล้วผ่านทั้งคู่
 * ตรงนี้ล็อกโควตาของคนนี้ก่อน (`lockStorage`) แล้วเช็คกับยอดล่าสุดในคำสั่งเดียวกับ insert
 * ยอดรวมคำขอที่ยังเปิดอยู่ด้วย (`usedBytesSql`) — ไบต์ที่อนุมัติไปแล้วถูกจองไว้
 *
 * `supersede` — คำขอเก่าที่ยังเปิดอยู่ของไฟล์เดียวกัน (ออเดอร์ ชื่อ ขนาดเดียวกัน) ถูกปิดทิ้ง
 * ในทรานแซกชันเดียวกัน: อัปล้มเพราะเน็ตหลุดหรือปิดแท็บไป คำขอเดิมยังจองพื้นที่อยู่
 * (เรียก `cancelUpload` ไม่ทันเพราะเน็ตหลุดนั่นแหละ) ถ้าไม่ปิดทิ้ง คนแพ็กฟรี 2 GB
 * ที่อัปไฟล์ 1.5 GB ไม่ผ่านจะกดลองใหม่ไม่ได้อีกเจ็ดชั่วโมง
 */
async function insertIntentWithinQuota(input: {
  id: string;
  userId: string;
  bucket: "public" | "private";
  key: string;
  kind: string;
  orderId: string | null;
  contentType: string;
  bytes: number;
  filename: string;
  uploadId: string | null;
  ttlMs: number;
  limit: number;
  supersede?: boolean;
}): Promise<boolean> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + input.ttlMs).toISOString();
  const insert = db.execute(sql`
    insert into upload_intent
      (id, user_id, bucket, key, kind, order_id, content_type, bytes, filename, upload_id, expires_at)
    select ${input.id}::text, ${input.userId}::text, ${input.bucket}::text, ${input.key}::text,
           ${input.kind}::text, ${input.orderId}::text, ${input.contentType}::text, ${input.bytes}::int,
           ${input.filename}::text, ${input.uploadId}::text, ${expiresAt}::timestamptz
    where ${withinQuotaSql(input.userId, input.bytes, input.limit)}
    returning id
  `);

  if (input.supersede && input.orderId) {
    const [, superseded, inserted] = await db.batch([
      lockStorage(input.userId),
      db
        .update(schema.uploadIntent)
        // ⚠️ ปิดแบบหมดอายุด้วย ไม่ใช่แค่ใช้แล้ว — ดู `claimIntent` (ใช้แล้ว+ยังไม่หมดอายุ = มีคนถืออยู่)
        .set({ consumedAt: sql`now()`, expiresAt: sql`least(${schema.uploadIntent.expiresAt}, now())` })
        .where(
          and(
            eq(schema.uploadIntent.userId, input.userId),
            eq(schema.uploadIntent.bucket, input.bucket),
            eq(schema.uploadIntent.orderId, input.orderId),
            eq(schema.uploadIntent.filename, input.filename),
            eq(schema.uploadIntent.bytes, input.bytes),
            isNull(schema.uploadIntent.consumedAt),
          ),
        )
        .returning({ key: schema.uploadIntent.key, uploadId: schema.uploadIntent.uploadId }),
      insert,
    ]);
    /**
     * ⚠️ ต้องทิ้งชิ้นของคำขอเก่าทันที ไม่ใช่รองานเก็บกวาด — คำขอเก่าเลิกจองพื้นที่ตั้งแต่บรรทัดบน
     * ถ้าปล่อยชิ้นค้างไว้ "ขอใหม่ไฟล์เดิม" ซ้ำ ๆ จะกลายเป็นทางอัปเกินโควตาได้ไม่จำกัดอีกทาง
     * (ส่งทุกชิ้นแล้วขอใหม่ วนไป) ยกเลิกแล้วชิ้นที่ยังส่งอยู่จากแท็บเก่าก็ล้มไปเอง
     */
    for (const old of superseded) {
      if (old.uploadId) await abortPrivateMultipart(old.key, old.uploadId).catch(() => {});
    }
    return affectedRows(inserted) > 0;
  }

  const [, inserted] = await db.batch([lockStorage(input.userId), insert]);
  return affectedRows(inserted) > 0;
}

/* ── ไฟล์ส่งมอบ: ถังส่วนตัว อัปเป็นชิ้น ─────────────────────────── */

const DeliverySchema = z.object({
  kind: z.enum(["final", "wip"]).default("final"),
  code: z.string().refine(isOrderCode),
  filename: z.string().trim().max(MAX_FILENAME_LENGTH),
  contentType: z.string().max(200),
  bytes: z.number().int().positive(),
});

export type StartDeliveryUploadResult =
  | {
      ok: true;
      intentId: string;
      partSize: number;
      urls: string[];
      /**
       * คำขอนี้ใช้บันทึกได้อีกนานเท่าไร — ให้เบราว์เซอร์รู้ว่าลองบันทึกซ้ำได้ถึงเมื่อไร
       * ส่งเป็นระยะเวลา ไม่ใช่เวลาปลายทาง: นาฬิกาเครื่องผู้ใช้อาจเพี้ยนไปเป็นนาที
       */
      expiresInMs: number;
    }
  | Fail;

/**
 * ⚠️ **ไม่ตรวจว่าจ่ายเงินครบหรือยัง** — อัปโหลดก่อนได้เงินไม่อันตราย
 * ถังส่วนตัวเปิดตรงไม่ได้ ด่านเรื่องเงินอยู่ที่ `delivery.releasedAt` กับ `canRelease()`
 * ตอนขอ URL ดาวน์โหลด ครีเอเตอร์ต้องเตรียมไฟล์ไว้ก่อนแล้วค่อยกดส่งมอบได้
 *
 * ไม่จำกัดชนิดไฟล์ — ไฟล์ส่งมอบเป็น PSD, CLIP, ZIP, MP4 ได้ทั้งนั้น
 */
export async function startDeliveryUpload(
  input: z.input<typeof DeliverySchema>,
): Promise<StartDeliveryUploadResult> {
  const session = await getSession();
  if (!session) return fail("forbidden");

  const parsed = DeliverySchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const v = parsed.data;
  const userId = session.user.id;

  if (v.bytes > MAX_DELIVERY_BYTES) return fail("too_large");
  if (v.kind === "wip" && (v.contentType !== "image/webp" || v.bytes > MAX_IMAGE_UPLOAD_BYTES)) return fail("invalid");

  const order = await getDb().query.order.findFirst({
    where: eq(schema.order.code, v.code),
    columns: { id: true, status: true },
    with: { page: { columns: { userId: true } } },
  });
  // ไม่มีออเดอร์ กับไม่ใช่ของเรา ตอบเหมือนกัน — ไม่บอกว่ามีอยู่แต่เข้าไม่ได้
  if (!order || order.page.userId !== userId) return fail("forbidden");

  /**
   * อัปโหลดได้เฉพาะช่วงที่ยัง "ทำงานอยู่" — ปิดออเดอร์แล้วยังอัปไฟล์เข้าไปได้
   * = เพิ่มของเข้าหลักฐานที่ปิดไปแล้ว (`registerDeliveryFile` เช็คซ้ำตอนบันทึก)
   */
  if (!canUploadDelivery(order.status)) return fail("invalid_state");

  const gate = await rateLimit(
    `delivery:${userId}`,
    LIMITS.deliveryUpload.limit,
    LIMITS.deliveryUpload.windowSeconds,
  );
  if (!gate.ok) return fail("rate_limited");

  /**
   * ⚠️ ไม่อ่านโควตาล่วงหน้าแบบรูป — คำขอค้างของไฟล์เดียวกันจะถูกนับทั้งที่กำลังจะถูกปิดทิ้ง
   * ใน insert ด้านล่าง คนที่กดลองใหม่หลังอัปล้มจึงโดนบอกว่าเต็มทั้งที่ไม่เต็ม
   * ด่านเดียวคือ insert แบบมีเงื่อนไข (แลกกับการเปิด multipart ทิ้งเปล่าเมื่อเต็มจริง)
   */
  const limit = planLimits(session.user.plan).storage_bytes;
  const intentId = newId("upl");
  // กฎ path อยู่ที่ lib/delivery/path.ts — ไฟล์ของออเดอร์เดียวกันอยู่ใต้ prefix เดียวกัน
  const key = `${deliveryPrefix(v.code)}${crypto.randomUUID()}`;
  const contentType = safeContentType(v.contentType);
  let uploadId: string | null = null;
  try {
    const started = await startPrivateMultipart({ key, contentType, sizes: partPlan(v.bytes) });
    uploadId = started.uploadId;
    const ok = await insertIntentWithinQuota({
      id: intentId,
      userId,
      bucket: "private",
      key,
      kind: v.kind,
      orderId: order.id,
      contentType,
      bytes: v.bytes,
      filename: v.filename,
      uploadId,
      ttlMs: DELIVERY_INTENT_TTL_MS,
      limit,
      supersede: true,
    });
    if (!ok) {
      await abortPrivateMultipart(key, uploadId).catch(() => {});
      return fail("storage_quota_exceeded");
    }
    return { ok: true, intentId, partSize: PART_SIZE, urls: started.urls, expiresInMs: DELIVERY_INTENT_TTL_MS };
  } catch (err) {
    console.error("[uploads] start delivery", err instanceof Error ? err.message : err);
    // เปิด multipart ได้แต่บันทึกคำขอไม่ได้ = ไม่มีแถวให้งานเก็บกวาดตามเจอ ต้องยกเลิกเอง
    if (uploadId) await abortPrivateMultipart(key, uploadId).catch(() => {});
    return fail("upload_failed");
  }
}

/**
 * ยกเลิกคำขออัปโหลดที่อัปไม่สำเร็จ — คืนพื้นที่ที่จองไว้ทันที ไม่ต้องรอหมดอายุ
 * และทิ้งชิ้นที่ส่งไปแล้ว (multipart ที่ค้างกินพื้นที่ถังจนกว่าจะถูกยกเลิก)
 *
 * เรียกแบบ best-effort จากเบราว์เซอร์ — เน็ตหลุดจนเรียกไม่ถึงก็ไม่เป็นไร
 * คำขอหมดอายุเองและงานเก็บกวาดตามลบให้ (lib/media/cleanup.ts)
 *
 * ⚠️ ปิดคำขอด้วย compare-and-set ก่อนลบไฟล์เสมอ — หลังจากนี้ `registerMedia` /
 * `registerDeliveryFile` claim คำขอนี้ไม่ได้แล้ว ไฟล์ที่กำลังจะลบจึงไม่มีทางถูกบันทึกทีหลัง
 * และถ้ามีแถว `media` ชี้ key นี้อยู่แล้ว (บันทึกสำเร็จแต่คำตอบหาย) ห้ามแตะไฟล์
 * ⚠️ ต้องตั้งให้หมดอายุด้วย — `registerDeliveryFile` claim คำขอที่ "ใช้แล้วแต่ค้างนาน" ต่อได้
 * (การเรียกที่ถือไว้ตายไป) ใช้แล้วเฉย ๆ อีกสิบกว่านาทีคำขอที่ยกเลิกแล้วจะกลับมาบันทึกได้
 */
export async function cancelUpload(intentId: string): Promise<void> {
  const session = await getSession();
  if (!session || typeof intentId !== "string" || intentId.length > 64) return;
  const db = getDb();

  const [row] = await db
    .update(schema.uploadIntent)
    .set({ consumedAt: sql`now()`, expiresAt: sql`least(${schema.uploadIntent.expiresAt}, now())` })
    .where(
      and(
        eq(schema.uploadIntent.id, intentId),
        eq(schema.uploadIntent.userId, session.user.id),
        isNull(schema.uploadIntent.consumedAt),
      ),
    )
    .returning({
      bucket: schema.uploadIntent.bucket,
      key: schema.uploadIntent.key,
      uploadId: schema.uploadIntent.uploadId,
    });
  if (!row) return;

  const used = await db.query.media.findFirst({
    columns: { id: true },
    where: eq(schema.media.pathname, row.key),
  });
  if (used) return;

  try {
    if (row.bucket === "private") {
      if (row.uploadId) await abortPrivateMultipart(row.key, row.uploadId);
      await deleteObjects("private", [row.key]);
    } else {
      await deleteObjects("public", [row.key]);
    }
  } catch (err) {
    // ไม่เป็นไร — คำขอถูกปิดแล้ว งานเก็บกวาดตามลบไฟล์ให้ทีหลัง
    console.error("[uploads] cancel", err instanceof Error ? err.message : err);
  }
}
