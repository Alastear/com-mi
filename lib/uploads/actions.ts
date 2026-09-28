"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { deliveryPrefix } from "@/lib/delivery/path";
import { PUBLIC_MEDIA_KINDS } from "@/lib/media/kinds";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/media/prepare";
import { ACCEPTED_VIDEO_TYPES, MAX_VIDEO_BYTES } from "@/lib/media/video";
import { isOrderCode } from "@/lib/orders/code";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import {
  MAX_DELIVERY_BYTES,
  PART_SIZE,
  partPlan,
  publicKey,
  safeContentType,
} from "@/lib/storage/keys";
import { presignPublicPut, startPrivateMultipart } from "@/lib/storage/r2";
import {
  DELIVERY_INTENT_TTL_MS,
  MEDIA_INTENT_TTL_MS,
  planLimits,
  storageUsed,
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

  if ((await storageUsed(userId)) + bytes > limits.storage_bytes) {
    return fail("storage_quota_exceeded");
  }

  const intentId = newId("upl");
  // key สุ่มฝั่งเรา — เบราว์เซอร์ไม่มีสิทธิ์เลือก path เอง
  const key = publicKey(kind, crypto.randomUUID(), contentType);
  try {
    const signed = await presignPublicPut({ key, contentType, bytes });
    await getDb().insert(schema.uploadIntent).values({
      id: intentId,
      userId,
      bucket: "public",
      key,
      kind,
      contentType,
      bytes,
      expiresAt: new Date(Date.now() + MEDIA_INTENT_TTL_MS),
    });
    return { ok: true, intentId, ...signed };
  } catch (err) {
    console.error("[uploads] start media", err instanceof Error ? err.message : err);
    return fail("upload_failed");
  }
}

/* ── ไฟล์ส่งมอบ: ถังส่วนตัว อัปเป็นชิ้น ─────────────────────────── */

const DeliverySchema = z.object({
  code: z.string().refine(isOrderCode),
  filename: z.string().trim().max(200),
  contentType: z.string().max(200),
  bytes: z.number().int().positive(),
});

export type StartDeliveryUploadResult =
  | { ok: true; intentId: string; partSize: number; urls: string[] }
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

  const order = await getDb().query.order.findFirst({
    where: eq(schema.order.code, v.code),
    columns: { id: true, status: true },
    with: { page: { columns: { userId: true } } },
  });
  // ไม่มีออเดอร์ กับไม่ใช่ของเรา ตอบเหมือนกัน — ไม่บอกว่ามีอยู่แต่เข้าไม่ได้
  if (!order || order.page.userId !== userId) return fail("forbidden");

  /**
   * อัปโหลดได้เฉพาะช่วงที่ยัง "ทำงานอยู่"
   * สถานะเหล่านี้คือทั้งหมดที่ครีเอเตอร์เดินไป `delivered` ได้จาก state machine
   * ปิดออเดอร์แล้วยังอัปไฟล์เข้าไปได้ = เพิ่มของเข้าหลักฐานที่ปิดไปแล้ว
   */
  if (!["in_progress", "in_review", "revision_requested"].includes(order.status)) {
    return fail("invalid_state");
  }

  const gate = await rateLimit(
    `delivery:${userId}`,
    LIMITS.deliveryUpload.limit,
    LIMITS.deliveryUpload.windowSeconds,
  );
  if (!gate.ok) return fail("rate_limited");

  if ((await storageUsed(userId)) + v.bytes > planLimits(session.user.plan).storage_bytes) {
    return fail("storage_quota_exceeded");
  }

  const intentId = newId("upl");
  // กฎ path อยู่ที่ lib/delivery/path.ts — ไฟล์ของออเดอร์เดียวกันอยู่ใต้ prefix เดียวกัน
  const key = `${deliveryPrefix(v.code)}${crypto.randomUUID()}`;
  const contentType = safeContentType(v.contentType);
  try {
    const { uploadId, urls } = await startPrivateMultipart({
      key,
      contentType,
      sizes: partPlan(v.bytes),
    });
    await getDb().insert(schema.uploadIntent).values({
      id: intentId,
      userId,
      bucket: "private",
      key,
      kind: "final",
      orderId: order.id,
      contentType,
      bytes: v.bytes,
      filename: v.filename,
      uploadId,
      expiresAt: new Date(Date.now() + DELIVERY_INTENT_TTL_MS),
    });
    return { ok: true, intentId, partSize: PART_SIZE, urls };
  } catch (err) {
    console.error("[uploads] start delivery", err instanceof Error ? err.message : err);
    return fail("upload_failed");
  }
}
