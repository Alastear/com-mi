"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { pickDeliveryFor } from "./read";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { presignPrivateGet } from "@/lib/storage/r2";
import { isOrderCode } from "@/lib/orders/code";
import { canRelease } from "@/lib/orders/release";
import { moneyGateSql } from "@/lib/orders/release-sql";
import { assertTransition, TransitionError } from "@/lib/orders/state-machine";
import { notify } from "@/lib/notifications/create";
import type { OrderStatus } from "@/lib/types";

/**
 * ส่งมอบงานและปล่อยไฟล์
 *
 * **การปล่อยเป็นการกระทำที่ต้องกดเอง ไม่ใช่ผลพลอยได้จากตัวเลขเงิน**
 * ถ้าปล่อยอัตโนมัติทันทีที่ `amountPaidCents >= totalCents` ครีเอเตอร์ที่พิมพ์ยอดผิด
 * หนึ่งครั้งจะส่งไฟล์งานออกไปทันทีโดยไม่มีทางเรียกคืน — ปุ่มยกเลิกการยืนยันเงินเข้า
 * (`voidPayment`) ล็อกได้แค่ URL ที่จะออกต่อจากนี้ ไฟล์ที่ถูกโหลดไปแล้วเอาคืนไม่ได้
 * การแยกสองอย่างนี้ทำให้ความผิดพลาดเรื่องเงินไม่ลามไปถึงไฟล์
 */

const AttachSchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  mediaIds: z.array(z.string().max(60)).min(1).max(30),
  note: z.string().trim().max(2000),
  licenseType: z.enum(["personal", "commercial", "exclusive"]),
});

export type DeliveryResult =
  | { ok: true; deliveryId?: string }
  | {
      ok: false;
      error: "forbidden" | "invalid" | "not_paid" | "no_files" | "not_allowed" | "stale";
    };

/** หาออเดอร์พร้อมบทบาทของผู้เรียก — ทุก action ต้องผ่านตรงนี้ */
async function resolve(code: string, userId: string) {
  const order = await getDb().query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: {
      id: true,
      status: true,
      clientUserId: true,
      totalCents: true,
      amountPaidCents: true,
    },
    with: { page: { columns: { userId: true } } },
  });
  if (!order) return null;
  const isCreator = order.page.userId === userId;
  const isClient = order.clientUserId === userId;
  if (!isCreator && !isClient) return null;
  return { ...order, isCreator, isClient };
}

/** ครีเอเตอร์ผูกไฟล์ที่อัปไว้เข้ากับการส่งมอบหนึ่งครั้ง — ยังไม่ปล่อยให้ลูกค้า */
export async function attachDelivery(input: z.input<typeof AttachSchema>): Promise<DeliveryResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };

  const parsed = AttachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  const order = await resolve(v.code, session.user.id);
  if (!order || !order.isCreator) return { ok: false, error: "forbidden" };

  const db = getDb();

  /**
   * ตรวจไฟล์ทุกไฟล์ว่าเป็นของออเดอร์นี้ ของเจ้าของคนนี้ ชนิด final และอยู่ store ส่วนตัว
   * ตรวจที่นี่ครั้งเดียว แล้วตอนออก URL ดาวน์โหลดตรวจซ้ำจากตาราง media อีกที
   * — ไม่เคยเชื่อ `delivery.mediaIds` เป็นแหล่งอำนาจ เพราะเป็นบันทึกที่เก่ากว่า
   */
  const owned = await db.query.media.findMany({
    columns: { id: true },
    where: and(
      inArray(schema.media.id, v.mediaIds),
      eq(schema.media.orderId, order.id),
      eq(schema.media.ownerUserId, session.user.id),
      eq(schema.media.kind, "final"),
      eq(schema.media.access, "private"),
    ),
  });
  if (owned.length !== v.mediaIds.length) return { ok: false, error: "forbidden" };

  const deliveryId = newId("dlv");
  await db.insert(schema.delivery).values({
    id: deliveryId,
    orderId: order.id,
    mediaIds: v.mediaIds,
    note: v.note,
    licenseType: v.licenseType,
    // ยังไม่ปล่อย — ปล่อยเป็นอีกขั้นที่ต้องกดแยก
    releasedAt: null,
  });

  await db
    .update(schema.media)
    .set({ status: "linked" })
    .where(inArray(schema.media.id, v.mediaIds));

  revalidatePath(`/orders/${v.code}`);
  return { ok: true, deliveryId };
}

/** ครีเอเตอร์กดส่งมอบ — เปลี่ยนสถานะและปล่อยไฟล์พร้อมกัน */
export async function deliverAndRelease(code: string, deliveryId: string): Promise<DeliveryResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };
  if (!isOrderCode(code)) return { ok: false, error: "invalid" };

  const order = await resolve(code, session.user.id);
  if (!order || !order.isCreator) return { ok: false, error: "forbidden" };

  // อ่านเงินสด ๆ จาก DB ตรงนี้ ไม่ใช้ค่าที่หน้าเว็บถืออยู่
  if (!canRelease(order)) return { ok: false, error: "not_paid" };

  const db = getDb();
  const dlv = await db.query.delivery.findFirst({
    where: and(eq(schema.delivery.id, deliveryId), eq(schema.delivery.orderId, order.id)),
    columns: { id: true, mediaIds: true, releasedAt: true },
  });
  // ส่งมอบที่ไม่มีไฟล์เลย = ลูกค้าได้แจ้งเตือนว่างานเสร็จแล้วเปิดไปเจอหน้าเปล่า
  if (!dlv || dlv.mediaIds.length === 0) return { ok: false, error: "no_files" };

  const from = order.status as OrderStatus;

  /**
   * ออเดอร์ที่เป็น `delivered` อยู่แล้วแต่ไฟล์ยังไม่ถูกปล่อย = ปล่อยอย่างเดียว ไม่เปลี่ยนสถานะ
   *
   * เกิดจากปุ่มเปลี่ยนสถานะธรรมดาที่เคยพาไป `delivered` ได้โดยไม่ปล่อยไฟล์
   * (ปิดทางนั้นแล้วที่ `state-machine.ts` ด้วย `viaAction`) แต่ออเดอร์ที่ติดไปแล้ว
   * ต้องมีทางออก — `delivered` ไม่มีเส้นวนกลับหาตัวเอง `assertTransition` จึงตกทุกครั้ง
   * ผลคือลูกค้าที่จ่ายครบแล้วเห็นไฟล์ล็อกอยู่ตลอดกาล และปุ่มปล่อยของครีเอเตอร์พังถาวร
   */
  const alreadyDelivered = from === "delivered";
  if (!alreadyDelivered) {
    try {
      assertTransition(from, "delivered", "creator");
    } catch (err) {
      if (err instanceof TransitionError) return { ok: false, error: "not_allowed" };
      throw err;
    }
  }

  const now = new Date();

  /**
   * compare-and-set เหมือน transitionOrder — สองแท็บกดพร้อมกันต้องมีอันเดียวที่ผ่าน
   *
   * "จ่ายครบ" ต้องอยู่ใน `where` ด้วย ไม่ใช่แค่ `canRelease()` ด้านบน — ยกเลิกการยืนยัน
   * (`voidPayment`) ลดยอดลงได้ระหว่างที่เราอ่านกับเขียน ถ้าไม่เช็คซ้ำตรงนี้ ออเดอร์จะเป็น
   * `delivered` พร้อมแจ้งลูกค้าว่าได้ไฟล์แล้ว ทั้งที่ URL ดาวน์โหลดยังล็อกอยู่
   */
  if (!alreadyDelivered) {
    const updated = await db
      .update(schema.order)
      .set({ status: "delivered", updatedAt: now })
      .where(
        and(
          eq(schema.order.id, order.id),
          eq(schema.order.status, from),
          moneyGateSql("delivered"),
        ),
      )
      .returning({ id: schema.order.id });
    if (updated.length === 0) {
      // สถานะยังเหมือนเดิมแต่เขียนไม่ผ่าน = เงินลดลงระหว่างทาง ไม่ใช่มีคนกดไปก่อน
      const fresh = await resolve(code, session.user.id);
      const paidDropped = fresh && fresh.status === from && !canRelease(fresh);
      return { ok: false, error: paidDropped ? "not_paid" : "stale" };
    }
  }

  await db
    .update(schema.delivery)
    .set({ releasedAt: now })
    .where(eq(schema.delivery.id, dlv.id));

  await db.insert(schema.message).values({
    id: newId("msg"),
    orderId: order.id,
    senderUserId: session.user.id,
    isSystemEvent: true,
    eventType: "status_changed",
    eventData: { from, to: "delivered", actor: "creator" },
    createdAt: now,
  });

  await notify({
    userId: order.clientUserId,
    actorUserId: session.user.id,
    type: "delivery_released",
    data: { code },
    url: `/my/requests/${code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidatePath(`/orders/${code}`);
  revalidatePath(`/my/requests/${code}`);
  revalidatePath("/orders");
  return { ok: true };
}

export type DownloadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * ออก URL ดาวน์โหลดที่มีอายุสั้น
 *
 * ⚠️ **เป็น Server Action ไม่ใช่ route handler แบบ GET โดยตั้งใจ**
 * Server Action มีการตรวจ Origin/Host ของ Next ในตัว ส่วน route handler ไม่มี
 * และคุกกี้ของ Better Auth เป็น `sameSite: "lax"` ซึ่งอนุญาต GET ข้ามเว็บระดับบนสุด
 * แปลว่าเว็บอื่นทำลิงก์ให้ลูกค้ากดแล้วดูดไฟล์ออกไปได้ถ้าเป็น GET
 *
 * ⚠️ URL ที่ได้เป็น **bearer credential** — ทดสอบแล้วว่า `fetch()` เปล่า ๆ
 * ไม่มี header อะไรเลยก็โหลดได้ ใครได้ URL ไปก็โหลดได้เหมือนกัน
 * จึงคืนผ่านคำตอบของ action เท่านั้น ห้ามฝังใน HTML ห้ามใส่ในอีเมล
 * ห้ามเก็บลง DB และตั้งอายุสั้นที่สุดที่ยังโหลดจริงได้
 */
export async function requestDeliveryDownload(
  code: string,
  mediaId: string,
): Promise<DownloadResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };
  if (!isOrderCode(code)) return { ok: false, error: "invalid" };

  const order = await resolve(code, session.user.id);
  if (!order) return { ok: false, error: "forbidden" };

  const db = getDb();

  /**
   * ⚠️ หาแถวที่ **มีไฟล์นี้** จากทุกรอบ ไม่ใช่เอาแถวล่าสุดแล้วดูว่ามีไฟล์ไหม
   *
   * เดิมเลือกแถวล่าสุดแถวเดียว ซึ่งถูกต้องเฉพาะตอนมีรอบเดียว พอครีเอเตอร์เตรียม
   * รอบสอง แถวล่าสุดคือรอบสอง ไฟล์รอบแรกที่ลูกค้าจ่ายแล้วจึงตอบ `not_found`
   * ทั้งที่หน้าจอ (read.ts รวม `releasedFiles` จากทุกรอบ) เพิ่งวาดปุ่มโหลดให้
   * — commit ที่ทำให้หลายรอบใช้ได้แก้หน้าจอแต่ลืมตรงนี้ กฎการเลือกแถวอยู่ที่
   * `pickDeliveryFor` ที่เดียวและมีเทสต์คุม
   */
  const rows = await db.query.delivery.findMany({
    where: eq(schema.delivery.orderId, order.id),
    orderBy: [desc(schema.delivery.createdAt)],
    columns: { id: true, mediaIds: true, releasedAt: true, downloadedAt: true },
  });
  const dlv = pickDeliveryFor(rows, mediaId);
  // ไฟล์นี้ไม่เคยถูกผูกกับการส่งมอบรอบไหนของออเดอร์นี้เลย
  if (!dlv) return { ok: false, error: "not_found" };

  /**
   * ตรวจสองชั้นโดยตั้งใจ — `releasedAt` คือรูปที่ถูกแคชไว้ของข้อเท็จจริงเรื่องเงิน
   * ส่วน `canRelease()` คือข้อเท็จจริงเอง ถ้าวันหนึ่งมีทางแก้ยอดเงินย้อนหลัง
   * (เช่น ยกเลิกการยืนยัน) ชั้นที่สองจะจับได้ทันทีโดยไม่ต้องไปไล่ล้าง releasedAt
   */
  if (dlv.releasedAt === null) return { ok: false, error: "not_released" };
  if (!canRelease(order)) return { ok: false, error: "not_paid" };

  const media = await db.query.media.findFirst({
    where: and(
      eq(schema.media.id, mediaId),
      eq(schema.media.orderId, order.id),
      eq(schema.media.kind, "final"),
    ),
    columns: { pathname: true, filename: true },
  });
  if (!media) return { ok: false, error: "not_found" };

  /**
   * 15 นาที — พอสำหรับโหลดไฟล์ใหญ่บนมือถือไทย และสั้นพอที่ URL ที่หลุดไป
   * จะหมดอายุก่อนถูกส่งต่อไปไกล
   *
   * ทดสอบกับ R2 แล้ว: การหมดอายุตรวจตอน "เริ่ม" คำขอ ไฟล์ที่กำลังโหลดค้างอยู่ไม่ถูกตัดกลางคัน
   * (โหลด 8 MB นาน 12 วินาทีบน URL อายุ 3 วินาที ยังจบครบ) แต่การ resume ด้วย
   * Range หลังหมดอายุถูกปฏิเสธ 403
   */
  const ttlSeconds = 15 * 60;
  const validUntil = Date.now() + ttlSeconds * 1000;
  // ชื่อไฟล์ตอนโหลดเป็นชื่อเดิมที่ครีเอเตอร์อัปมา — key ในถังเป็นแค่ id
  const presignedUrl = await presignPrivateGet({
    key: media.pathname,
    filename: media.filename,
    expiresInSeconds: ttlSeconds,
  });

  /**
   * บันทึกทุกครั้งที่ออก URL — ถังส่วนตัวไม่มี log การโหลดให้เราอ่าน
   * ถ้าวันหนึ่งมีข้อพิพาทว่างานหลุด นี่คือสิ่งเดียวที่ตอบได้ว่าออกให้ใครเมื่อไร
   */
  await db.insert(schema.deliveryIssuance).values({
    id: newId("iss"),
    deliveryId: dlv.id,
    mediaId,
    userId: session.user.id,
    validUntil: new Date(validUntil),
  });

  // บันทึกครั้งแรกที่ลูกค้าโหลดเท่านั้น — ครีเอเตอร์กดดูไฟล์ตัวเองไม่นับ
  if (dlv.downloadedAt === null && order.isClient) {
    await db
      .update(schema.delivery)
      .set({ downloadedAt: new Date() })
      .where(eq(schema.delivery.id, dlv.id));
  }

  return { ok: true, url: presignedUrl };
}
