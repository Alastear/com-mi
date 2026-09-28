"use server";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { pickDeliveryFor } from "./read";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { deleteObjects, presignPrivateGet } from "@/lib/storage/r2";
import { canUploadDelivery, DELIVERY_UPLOAD_STATUSES } from "@/lib/delivery/path";
import { ATTACH_MAX, uniqueIds } from "@/lib/delivery/plan";
import { lockOrder } from "@/lib/orders/lock";
import { affectedRows } from "@/lib/uploads/intent";
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
  mediaIds: z.array(z.string().max(60)).min(1).max(ATTACH_MAX),
  note: z.string().trim().max(2000),
  licenseType: z.enum(["personal", "commercial", "exclusive"]),
});

export type DeliveryResult =
  | { ok: true; deliveryId?: string; added?: boolean }
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

/** เงื่อนไข "ออเดอร์ยังอยู่ในสถานะที่แก้ไฟล์ส่งมอบได้" ในรูป SQL — ใช้ใต้ `lockOrder` */
function orderAcceptsFilesSql(orderId: string) {
  const statuses = sql.join(
    DELIVERY_UPLOAD_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  return sql`exists (select 1 from "order" o where o.id = ${orderId} and o.status in (${statuses}))`;
}

/** ไฟล์นี้ (แถว media ที่ชื่อ `m`) ยังไม่อยู่ในการส่งมอบรอบไหนของออเดอร์นี้เลย */
function notInAnyRoundSql(orderId: string) {
  return sql`not exists (
    select 1 from delivery d
    where d.order_id = ${orderId} and d.media_ids @> jsonb_build_array(m.id)
  )`;
}

/**
 * ครีเอเตอร์ผูกไฟล์ที่อัปไว้เข้ากับการส่งมอบ — ยังไม่ปล่อยให้ลูกค้า
 *
 * ไม่มีรอบเปิดอยู่ = เปิดรอบใหม่ · มีรอบที่เตรียมไว้แต่ยังไม่ปล่อย = **ต่อท้ายรอบนั้น**
 *
 * ⚠️ เดิม insert แถวใหม่เสมอโดยไม่ดูว่ามีรอบเปิดอยู่แล้วไหม และหน้าจอซ่อนไฟล์ที่อัปหลังกดเตรียม
 * ครีเอเตอร์จึงติดอยู่กับชุดที่เตรียมไว้ — ถ้ายิง action ตรง ๆ ก็ได้รอบเปิดซ้อนสองรอบ
 * ซึ่งรอบเก่าหายจากจอ (read.ts เลือกรอบเปิดล่าสุดรอบเดียว) ไฟล์ในนั้นไม่ถูกปล่อยและไม่กลับมาเป็นไฟล์ค้าง
 *
 * ⚠️ ต่อท้ายแล้ว **เลื่อน `created_at` เป็นตอนนี้** — สถิติเวลาส่งงานของร้าน
 * (`HANDOVER_AT` ใน lib/queries/reputation.ts) นับ `created_at` ของรอบที่ปล่อยเป็นเวลาที่ไฟล์ชุดนั้นพร้อม
 * ถ้าไม่เลื่อน ร้านเตรียมรอบด้วยไฟล์หลอกไว้ก่อนกำหนด แล้วค่อยเติมงานจริงทีหลัง ก็ได้ "ตรงเวลา" ฟรี
 *
 * ⚠️ รอบที่ปล่อยแล้วแตะไม่ได้ — `released_at is null` อยู่ใน WHERE และ trigger ใน 0008 กันอีกชั้น
 * ถ้ารอบถูกปล่อยระหว่างทาง ไฟล์ชุดนี้ไปเปิดรอบใหม่แทน (คำสั่ง insert ถัดไปใน batch) ไม่หายเงียบ
 */
export async function attachDelivery(input: z.input<typeof AttachSchema>): Promise<DeliveryResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };

  const parsed = AttachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;
  const ids = uniqueIds(v.mediaIds);
  const userId = session.user.id;

  const order = await resolve(v.code, userId);
  if (!order || !order.isCreator) return { ok: false, error: "forbidden" };
  /**
   * ปิดงานแล้ว (ส่งมอบ/เสร็จ/ยกเลิก/ข้อพิพาท) ห้ามเปิดหรือเติมรอบ — เดิมไม่เช็คสถานะเลย
   * นี่คือคำตอบให้ตรงเรื่อง ด่านจริงอยู่ใน batch ใต้ lock ด้านล่าง
   */
  if (!canUploadDelivery(order.status)) return { ok: false, error: "not_allowed" };

  const db = getDb();

  /**
   * ตรวจไฟล์ทุกไฟล์ว่าเป็นของออเดอร์นี้ ของเจ้าของคนนี้ ชนิด final และอยู่ store ส่วนตัว
   * ตอบ `forbidden` ให้การยิง id ของคนอื่นเข้ามา — ส่วน "ยังไม่อยู่ในรอบไหน" ตัดสินใน batch
   * ตอนออก URL ดาวน์โหลดตรวจซ้ำจากตาราง media อีกที ไม่เคยเชื่อ `delivery.mediaIds` เป็นแหล่งอำนาจ
   */
  const owned = await db.query.media.findMany({
    columns: { id: true },
    where: and(
      inArray(schema.media.id, ids),
      eq(schema.media.orderId, order.id),
      eq(schema.media.ownerUserId, userId),
      eq(schema.media.kind, "final"),
      eq(schema.media.access, "private"),
    ),
  });
  if (owned.length !== ids.length) return { ok: false, error: "forbidden" };

  /**
   * ทุกไฟล์ยังใช้ได้ **ตอนเขียน**: ยังอยู่ (ไม่ถูกลบระหว่างทาง) ยังเป็นของคนนี้ และยังไม่อยู่ในรอบไหน
   * ไฟล์เดียวกันอยู่สองรอบ = รอบหนึ่งปล่อยไปแล้วอีกรอบยังล็อก ลูกค้าเห็นไฟล์เดิมซ้ำสองที่
   */
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  const allUsable = sql`(
    select count(*) from media m
    where m.id in (${idList}) and m.order_id = ${order.id} and m.owner_user_id = ${userId}
      and m.kind = 'final' and m.access = 'private'
      and ${notInAnyRoundSql(order.id)}
  ) = ${ids.length}::bigint`;
  const accepts = orderAcceptsFilesSql(order.id);
  const idsJson = JSON.stringify(ids);
  const deliveryId = newId("dlv");

  /**
   * batch เดียวใต้ lock ของออเดอร์ — การลบไฟล์ค้าง (`removeDeliveryFile`) และการบันทึกไฟล์ใหม่
   * ถือ lock เดียวกัน จึงไม่มีทางผูกไฟล์ที่เพิ่งถูกลบไปแล้ว
   *
   * คำสั่งที่ 2 ต่อท้ายรอบเปิด (ถ้ามี) · คำสั่งที่ 3 เปิดรอบใหม่เฉพาะเมื่อไม่มีรอบเปิดเหลืออยู่
   * คำสั่งที่ 3 มาหลังคำสั่งที่ 2 ใน transaction เดียวกัน จึงเห็นผลของมัน — ต่อท้ายสำเร็จแล้วไม่เปิดซ้อน
   * ⚠️ `order by created_at desc` ต้องตรงกับที่ read.ts เลือกรอบเปิดล่าสุดมาโชว์
   */
  const [, appended, inserted] = await db.batch([
    lockOrder(order.id),
    db.execute(sql`
      update delivery set media_ids = media_ids || ${idsJson}::jsonb, created_at = now()
      where id = (
          select d.id from delivery d
          where d.order_id = ${order.id} and d.released_at is null
          order by d.created_at desc limit 1
        )
        and released_at is null
        and ${accepts}
        and ${allUsable}
      returning id
    `),
    db.execute(sql`
      insert into delivery (id, order_id, media_ids, note, license_type)
      select ${deliveryId}::text, ${order.id}::text, ${idsJson}::jsonb, ${v.note}::text, ${v.licenseType}::text
      where not exists (select 1 from delivery d where d.order_id = ${order.id} and d.released_at is null)
        and ${accepts}
        and ${allUsable}
      returning id
    `),
    db.execute(sql`
      update media m set status = 'linked'
      where m.id in (${idList}) and m.order_id = ${order.id}
        and not ${notInAnyRoundSql(order.id)}
    `),
  ]);

  const added = affectedRows(appended) > 0;
  if (!added && affectedRows(inserted) === 0) {
    // ไม่ผ่าน — สถานะเปลี่ยน หรือไฟล์ถูกผูก/ลบไปแล้วจากอีกแท็บ ให้หน้าจอโหลดใหม่
    const fresh = await resolve(v.code, userId);
    return { ok: false, error: fresh && !canUploadDelivery(fresh.status) ? "not_allowed" : "stale" };
  }

  revalidatePath(`/orders/${v.code}`);
  return { ok: true, deliveryId: added ? firstId(appended) : deliveryId, added };
}

function firstId(result: unknown): string | undefined {
  const r = result as { rows?: { id: string }[] } | { id: string }[];
  return (Array.isArray(r) ? r[0] : r.rows?.[0])?.id;
}

export type RemoveFileResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid" | "not_allowed" | "stale" };

/**
 * ครีเอเตอร์ลบไฟล์ส่งมอบที่อัปผิด — เฉพาะไฟล์ที่ยังไม่อยู่ในรอบไหนเลย (ยังไม่เคยเตรียม ยังไม่เคยปล่อย)
 *
 * ไฟล์ที่อยู่ในรอบแล้วลบไม่ได้: รอบที่ปล่อยแล้วคือของที่ลูกค้าซื้อและเป็นหลักฐาน (trigger ใน 0008)
 * ส่วนไฟล์ในรอบที่เตรียมไว้ ต้องเอาออกจากรอบก่อน (`takeOutOfRound`) แล้วค่อยลบ
 *
 * ⚠️ **ไม่มีด่านสถานะออเดอร์** — ลบได้แม้งานปิดไปแล้ว (ส่งมอบ/เสร็จ/ยกเลิก/ข้อพิพาท)
 * เดิมลบได้เฉพาะช่วงที่ยังอัปไฟล์ได้ ครีเอเตอร์ที่อัปไฟล์เพิ่มแล้วกดส่งมอบโดยไม่ได้ใส่เข้ารอบ
 * ออเดอร์เป็น `delivered` → ลูกค้ากดรับงาน (หรือระบบปิดงานให้เอง) → ไฟล์นั้นค้างตลอดกาล:
 * ลบไม่ได้ ใส่รอบไม่ได้ กินโควตาพื้นที่ (`usedBytesSql` นับทุกแถว media) และไม่มีงานเก็บกวาดไหนแตะถังส่วนตัว
 * ไฟล์ที่ไม่อยู่ในรอบไหนเลยคือไฟล์ที่ลูกค้าไม่เคยได้และไม่เคยเห็น ไม่ใช่หลักฐานของอะไร
 * ด่านที่กันไม่ให้ลบไฟล์ที่กำลังถูกผูกเข้ารอบคือ `notInAnyRoundSql` ใต้ lock เดียวกับ `attachDelivery`
 *
 * ลำดับ: ลบแถวก่อน (compare-and-set ใต้ lock ของออเดอร์) แล้วค่อยลบไฟล์ในถัง
 * ⚠️ ห้ามลบไฟล์ก่อน — ถ้าแถวลบไม่ผ่านเพราะอีกแท็บเพิ่งผูกไฟล์นี้เข้ารอบ เราจะทำลายไฟล์ที่กำลังจะส่งให้ลูกค้า
 *
 * พื้นที่ได้คืนทันทีที่แถวหาย — `usedBytesSql` นับจากตาราง `media` (กับคำขอที่ยังไม่ถูกใช้)
 */
export async function removeDeliveryFile(code: string, mediaId: string): Promise<RemoveFileResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };
  if (!isOrderCode(code) || typeof mediaId !== "string" || !mediaId || mediaId.length > 60) {
    return { ok: false, error: "invalid" };
  }
  const userId = session.user.id;

  const order = await resolve(code, userId);
  if (!order || !order.isCreator) return { ok: false, error: "forbidden" };

  const db = getDb();

  /**
   * ลบแถวพร้อมทิ้ง "ป้ายหลุมศพ" ไว้ใน `upload_intent` ในคำสั่งเดียว
   *
   * ⚠️ ถ้าลบไฟล์ใน R2 ไม่สำเร็จ (เน็ตสะดุด) ไฟล์จะค้างในถังส่วนตัวโดยไม่มีแถวไหนรู้จัก
   * และงานเก็บกวาดแตะถังส่วนตัวได้ทางเดียวคือผ่านคำขออัปโหลด (lib/media/cleanup.ts)
   * คำขอเดิมของไฟล์นี้อาจถูกเก็บกวาดไปแล้ว (บันทึกสำเร็จเกิน 24 ชม.) — จึงสร้าง/แก้แถวคำขอให้
   * "ใช้แล้ว + หมดอายุ" ชี้ key นี้ งานเก็บกวาดจะเห็นว่าไม่มีแถว media ชี้ถึงแล้วลบให้ (`purge`)
   * ใช้แล้ว = ไม่จองโควตา (usedBytesSql) และ `claimIntent` เอาไปบันทึกซ้ำไม่ได้
   */
  const [, gone] = await db.batch([
    lockOrder(order.id),
    db.execute(sql`
      with gone as (
        delete from media m
        where m.id = ${mediaId} and m.order_id = ${order.id} and m.owner_user_id = ${userId}
          and m.kind = 'final' and m.access = 'private'
          and ${notInAnyRoundSql(order.id)}
        returning m.pathname, m.bytes, m.content_type, m.filename
      )
      insert into upload_intent
        (id, user_id, bucket, key, kind, order_id, content_type, bytes, filename, expires_at, consumed_at)
      select ${newId("upl")}::text, ${userId}::text, 'private', g.pathname, 'final', ${order.id}::text,
             g.content_type, g.bytes, g.filename, now(), now()
      from gone g
      on conflict (key) do update
        set expires_at = least(upload_intent.expires_at, now()),
            consumed_at = coalesce(upload_intent.consumed_at, now())
      returning key
    `),
  ]);

  const key = firstKey(gone);
  // ไฟล์ถูกผูกเข้ารอบหรือถูกลบไปแล้วจากอีกแท็บ — ให้หน้าจอโหลดใหม่
  if (!key) return { ok: false, error: "stale" };

  try {
    await deleteObjects("private", [key]);
    // ไฟล์หายแล้วจริง ป้ายหลุมศพไม่ต้องรอให้งานเก็บกวาดมาเก็บ
    await db
      .delete(schema.uploadIntent)
      .where(and(eq(schema.uploadIntent.key, key), eq(schema.uploadIntent.userId, userId)));
  } catch (err) {
    // แถวหายไปแล้ว ผู้ใช้ได้พื้นที่คืนแล้ว — ไฟล์ที่ค้างเป็นหน้าที่ของงานเก็บกวาดผ่านป้ายด้านบน
    console.error("[delivery-remove]", err instanceof Error ? err.message : err);
  }

  revalidatePath(`/orders/${code}`);
  return { ok: true };
}

function firstKey(result: unknown): string | undefined {
  const r = result as { rows?: { key: string }[] } | { key: string }[];
  return (Array.isArray(r) ? r[0] : r.rows?.[0])?.key;
}

/**
 * ครีเอเตอร์เอาไฟล์ออกจากรอบที่เตรียมไว้แต่ยังไม่ปล่อย — ไฟล์กลับไปเป็นไฟล์ค้าง (ลบทิ้งหรือเพิ่มกลับได้)
 *
 * ⚠️ เดิมไม่มีทางนี้เลย: กด "เพิ่มเข้ารอบนี้" (ส่งไฟล์ค้างทุกไฟล์) แล้วมีไฟล์ผิดติดไปหนึ่งไฟล์
 * — เช่น PSD ของลูกค้าอีกคน — ไฟล์นั้นลบไม่ได้ เอาออกไม่ได้ ทางเดียวที่จะส่งไฟล์ที่ถูก
 * คือส่งไฟล์ผิดให้ลูกค้าไปด้วย
 *
 * รอบที่เหลือว่างถูกลบทิ้งในทรานแซกชันเดียวกัน — รอบว่างที่ยังเปิดอยู่ทำให้ปุ่มส่งมอบโผล่
 * แต่กดแล้วได้ `no_files` ทุกครั้ง (โน้ตถึงลูกค้าของรอบนั้นหายไปด้วย ยอมรับได้: ยังไม่เคยส่ง)
 *
 * ⚠️ แข่งกับ `deliverAndRelease` ได้ — ทั้งคู่ถือ `lockOrder` และ batch ของการปล่อยตรวจรอบซ้ำ
 * ใต้ lock (ยังไม่ปล่อย + ยังมีไฟล์) ก่อนเปลี่ยนสถานะ จึงไม่มีทางปล่อยรอบว่าง
 * หรือพาออเดอร์ไป `delivered` โดยไม่มีไฟล์ใหม่ ส่วนรอบที่ถูกปล่อยไปก่อน `released_at is null` กันไว้
 */
export async function takeOutOfRound(code: string, mediaId: string): Promise<RemoveFileResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };
  if (!isOrderCode(code) || typeof mediaId !== "string" || !mediaId || mediaId.length > 60) {
    return { ok: false, error: "invalid" };
  }
  const userId = session.user.id;

  const order = await resolve(code, userId);
  if (!order || !order.isCreator) return { ok: false, error: "forbidden" };
  // งานปิดแล้วรอบที่ค้างอยู่ไม่มีวันถูกปล่อย — คำตอบให้ตรงเรื่อง ด่านจริงอยู่ใน batch
  if (!canUploadDelivery(order.status)) return { ok: false, error: "not_allowed" };

  const db = getDb();
  const idJson = JSON.stringify([mediaId]);

  /**
   * คำสั่งที่ 2 ตัด id ออก (`jsonb - text` ตัดทุกตัวที่ตรง) เฉพาะรอบที่ยังไม่ปล่อยและงานยังเปิด
   * คำสั่งที่ 3 ลบรอบที่ว่างแล้ว · คำสั่งที่ 4 คืนสถานะไฟล์เป็น orphan แบบตอนเพิ่งอัป
   * (ไฟล์ส่วนตัวไม่เคยถูกเก็บกวาดด้วยสถานะนี้ — `orphanUnreferenced` / `dueOrphanSql` แตะแค่ public)
   * คำสั่งหลังเห็นผลของคำสั่งก่อนหน้าในทรานแซกชันเดียวกัน
   */
  const [, out] = await db.batch([
    lockOrder(order.id),
    db.execute(sql`
      update delivery d set media_ids = d.media_ids - ${mediaId}::text
      where d.order_id = ${order.id} and d.released_at is null
        and d.media_ids @> ${idJson}::jsonb
        and ${orderAcceptsFilesSql(order.id)}
      returning d.id
    `),
    db.execute(sql`
      delete from delivery d
      where d.order_id = ${order.id} and d.released_at is null and jsonb_array_length(d.media_ids) = 0
    `),
    db.execute(sql`
      update media m set status = 'orphan'
      where m.id = ${mediaId} and m.order_id = ${order.id} and ${notInAnyRoundSql(order.id)}
    `),
  ]);

  if (affectedRows(out) === 0) {
    // รอบถูกปล่อยไปแล้ว ไฟล์ถูกเอาออกไปแล้ว หรือสถานะเปลี่ยนระหว่างทาง — ให้หน้าจอโหลดใหม่
    const fresh = await resolve(code, userId);
    return { ok: false, error: fresh && !canUploadDelivery(fresh.status) ? "not_allowed" : "stale" };
  }

  revalidatePath(`/orders/${code}`);
  revalidatePath(`/my/requests/${code}`);
  return { ok: true };
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
  // รอบหายไปแล้ว = เอาไฟล์ออกจนหมดจากอีกแท็บ (`takeOutOfRound` ลบรอบที่ว่าง) — หน้าจอเก่ากว่าของจริง
  if (!dlv) return { ok: false, error: "stale" };
  // ส่งมอบที่ไม่มีไฟล์เลย = ลูกค้าได้แจ้งเตือนว่างานเสร็จแล้วเปิดไปเจอหน้าเปล่า
  if (dlv.mediaIds.length === 0) return { ok: false, error: "no_files" };
  /**
   * ⚠️ รอบนี้ถูกปล่อยไปแล้ว (แท็บเก่ากดซ้ำ) — ห้ามเดินต่อ
   * ไม่งั้นออเดอร์ที่กลับมาทำรอบแก้อยู่จะถูกพาไป `delivered` และลูกค้าได้แจ้งเตือน "ได้ไฟล์แล้ว"
   * ทั้งที่ไม่มีไฟล์ใหม่ และการเขียน `released_at` ซ้ำชน trigger ใน 0008 กลายเป็น error ที่ถูกซ่อน
   */
  if (dlv.releasedAt !== null) return { ok: false, error: "stale" };

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
   * เปลี่ยนสถานะ + ปล่อยรอบ ใน batch เดียวใต้ lock ของออเดอร์ — ผ่านทั้งคู่หรือไม่ผ่านเลย
   *
   * ⚠️ เดิมเป็นสองคำสั่งแยกกันหลังอ่านรอบไปแล้ว ระหว่างนั้นรอบเปลี่ยนได้ (เอาไฟล์ออกจนว่าง
   * ปล่อยจากอีกแท็บ) แล้วได้ออเดอร์ `delivered` + แจ้งลูกค้าว่าได้ไฟล์ ทั้งที่รอบที่ปล่อยว่างเปล่า
   * หรือไม่มีรอบไหนถูกปล่อยเลย ตอนนี้ตรวจรอบซ้ำใต้ lock เดียวกับ `attachDelivery` / `takeOutOfRound`
   *
   * compare-and-set เหมือน transitionOrder — สองแท็บกดพร้อมกันต้องมีอันเดียวที่ผ่าน
   * "จ่ายครบ" ต้องอยู่ใน `where` ด้วย ไม่ใช่แค่ `canRelease()` ด้านบน — ยกเลิกการยืนยัน
   * (`voidPayment`) ลดยอดลงได้ระหว่างที่เราอ่านกับเขียน ถ้าไม่เช็คซ้ำตรงนี้ ออเดอร์จะเป็น
   * `delivered` พร้อมแจ้งลูกค้าว่าได้ไฟล์แล้ว ทั้งที่ URL ดาวน์โหลดยังล็อกอยู่
   */
  const roundReady = sql`exists (
    select 1 from delivery d
    where d.id = ${dlv.id} and d.order_id = ${order.id}
      and d.released_at is null and jsonb_array_length(d.media_ids) > 0
  )`;
  /**
   * ปล่อยได้ครั้งเดียว (`released_at is null`) และเฉพาะเมื่อออเดอร์เป็น `delivered` + จ่ายครบ
   * **ตอนนี้** — ในทางปกติคือผลของคำสั่งเปลี่ยนสถานะก่อนหน้าใน batch เดียวกัน
   * ถ้าคำสั่งนั้นไม่ผ่าน สถานะยังไม่ใช่ `delivered` คำสั่งนี้จึงไม่ผ่านตาม
   * ไฟล์ที่ถูกต่อท้ายเข้ารอบนี้ก่อน batch นี้ได้ lock (`attachDelivery`) ถูกปล่อยไปด้วย — เป็นรอบเดียวกันที่ครีเอเตอร์กดปล่อย
   * ⚠️ subquery ใช้ `"order"` ไม่ตั้ง alias — `moneyGateSql` อ้างคอลัมน์เป็น "order"."…"
   */
  const release = db
    .update(schema.delivery)
    .set({ releasedAt: now })
    .where(
      and(
        eq(schema.delivery.id, dlv.id),
        isNull(schema.delivery.releasedAt),
        sql`jsonb_array_length(${schema.delivery.mediaIds}) > 0`,
        sql`exists (
          select 1 from "order"
          where "order"."id" = ${order.id} and "order"."status" = 'delivered' and ${moneyGateSql("delivered")}
        )`,
      ),
    )
    .returning({ id: schema.delivery.id });

  let released: { id: string }[];
  if (alreadyDelivered) {
    [, released] = await db.batch([lockOrder(order.id), release]);
  } else {
    const flip = db
      .update(schema.order)
      .set({ status: "delivered", updatedAt: now })
      .where(
        and(
          eq(schema.order.id, order.id),
          eq(schema.order.status, from),
          moneyGateSql("delivered"),
          roundReady,
        ),
      )
      .returning({ id: schema.order.id });
    const [, flipped, rel] = await db.batch([lockOrder(order.id), flip, release]);
    released = rel;
    if (flipped.length === 0) {
      // สถานะยังเหมือนเดิมแต่เขียนไม่ผ่าน = เงินลดลงระหว่างทาง · อย่างอื่น = รอบ/สถานะเปลี่ยนจากอีกแท็บ
      const fresh = await resolve(code, session.user.id);
      const paidDropped = fresh && fresh.status === from && !canRelease(fresh);
      return { ok: false, error: paidDropped ? "not_paid" : "stale" };
    }
  }
  /**
   * ทางปกติไม่มีทางมาถึงตรงนี้หลังเปลี่ยนสถานะสำเร็จ (ทั้งสองคำสั่งเห็นแถวเดียวกันใต้ lock)
   * เหลือแค่กรณีออเดอร์ `delivered` อยู่แล้วและรอบถูกปล่อย/เปลี่ยนจากอีกแท็บ
   */
  if (released.length === 0) return { ok: false, error: "stale" };

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
