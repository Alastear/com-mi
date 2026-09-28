"use server";

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications/create";
import { isOrderCode } from "./code";
import { assertTransition, requiresAction, TransitionError, type Actor } from "./state-machine";
import { moneyBlock } from "./release";
import { moneyGateSql } from "./release-sql";
import { consumesRevision, revisionQuota } from "./revisions";
import { lockOrder } from "./lock";
import { orderVersion, versionIso } from "./version";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

/**
 * เปลี่ยนสถานะออเดอร์ — ทางเดียวที่ได้รับอนุญาตให้เขียน `order.status`
 *
 * อยู่ใน lib/ ไม่ใช่ colocate กับหน้า เพราะถูกเรียกจากทั้งฝั่งครีเอเตอร์ `(app)`
 * และฝั่งลูกค้า `(public)` (แบบเดียวกับ lib/media/actions.ts)
 *
 * ⚠️ **actor มาจาก session เท่านั้น ห้ามรับจาก client**
 * ถ้าให้ client บอกว่าตัวเองเป็นใคร ลูกค้าจะส่ง actor:"creator" มาแล้วกดอนุมัติงานตัวเองได้
 */

const Schema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  /**
   * สถานะที่หน้าจอของคนกด **เห็นอยู่ตอนกด** — ไม่ใช่สถานะที่ server อ่านได้ตอนนี้
   *
   * ⚠️ เดิม compare-and-set เทียบกับสถานะที่ server เพิ่งอ่านมาเอง ซึ่งตรงกับของจริงเสมอ
   * แท็บที่เปิดค้างไว้จึงกดผ่านได้ทุกครั้ง: ลูกค้าเปิดหน้า "ส่งงานแล้ว" ค้างไว้ ครีเอเตอร์
   * เปิดรอบแก้เองแล้วส่ง WIP รอบใหม่ (`in_review`) ลูกค้ากด "ขอแก้ไข" จากแท็บเก่า →
   * เสียสิทธิ์แก้ไปกับรอบที่ไม่เคยเห็น ส่งค่านี้มาแล้วไม่ตรงของจริง = `stale` ให้รีเฟรชก่อน
   *
   * ⚠️ จับได้เฉพาะตอนสถานะต่างกัน ถ้าออเดอร์วนกลับมาสถานะเดิม (in_review รอบ 1 → … →
   * in_review รอบ 2) ระหว่างที่แท็บเปิดค้าง ค่านี้จะตรงกันและยังผ่าน — `version` ข้างล่างปิดช่องนี้
   */
  from: z.enum(ORDER_STATUSES),
  /**
   * `order.updatedAt` (มิลลิวินาที) ที่หน้าจอของคนกดวาดอยู่ — ดู lib/orders/version.ts
   *
   * ⚠️ `from` อย่างเดียวไม่พอตั้งแต่ครีเอเตอร์ถอยจาก in_review กลับไปทำต่อเองได้: ครีเอเตอร์กด
   * "กลับไปทำต่อ" แล้วส่ง WIP ใหม่ = in_review เหมือนเดิมแต่เป็นรอบที่ลูกค้าไม่เคยเห็น ลูกค้ากด
   * "ขอแก้ไข" จากแท็บเก่า → `from` ตรง → เสียสิทธิ์แก้ไปกับรอบใหม่ ทุกการเปลี่ยนสถานะขยับ
   * `updatedAt` จึงจับรอบที่วนกลับมาได้ ไม่ตรง = `stale`
   * บังคับส่งทุกครั้ง (ไม่ optional) — ด่านที่ข้ามได้ด้วยการไม่ส่งคือด่านที่ถูกลืมส่งสักวัน
   */
  version: z.number().int().min(0),
  to: z.enum(ORDER_STATUSES),
  /** สิ่งที่คนกดยกเลิกเห็นเรื่องเงิน ตอนกด — ดู `MoneyAck` ใน lib/orders/cancel.ts */
  moneyAck: z
    .object({
      rows: z.number().int().min(0).max(10_000),
      paidCents: z.number().int().min(0).max(1_000_000_000),
    })
    .optional(),
});

export type TransitionResult =
  | { ok: true; status: OrderStatus }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "not_found"
        | "invalid"
        | "not_allowed"
        | "wrong_actor"
        | "stale"
        | "deposit_unpaid"
        | "not_fully_paid"
        | "no_files"
        | "price_missing"
        | "revisions_exhausted"
        | "use_dedicated_action"
        | "money_changed";
    };

export async function transitionOrder(input: {
  code: string;
  from: OrderStatus;
  /** `orderVersion(order.updatedAt)` ของหน้าที่วาดปุ่มนี้ */
  version: number;
  to: OrderStatus;
  moneyAck?: { rows: number; paidCents: number };
}): Promise<TransitionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, from, version, to, moneyAck } = parsed.data;

  const db = getDb();

  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: {
      id: true,
      status: true,
      clientUserId: true,
      creatorPageId: true,
      depositCents: true,
      amountPaidCents: true,
      totalCents: true,
      revisionsUsed: true,
      revisionsAllowed: true,
      updatedAt: true,
    },
    with: { page: { columns: { userId: true } } },
  });
  if (!order) return { ok: false, error: "not_found" };

  // หาบทบาทจาก session ล้วน ๆ — ไม่มีทางที่ client จะแทรกแซงได้
  const actor: Actor | null =
    order.page.userId === session.user.id
      ? "creator"
      : order.clientUserId === session.user.id
        ? "client"
        : null;
  // ไม่เกี่ยวข้องกับออเดอร์นี้ = ตอบเหมือนไม่มีอยู่จริง ไม่บอกว่ามีแต่เข้าไม่ได้
  if (!actor) return { ok: false, error: "not_found" };

  // หน้าจอของคนกดไม่ได้เห็นสถานะนี้ — ห้ามตัดสินแทนเขาจากของที่เขาไม่เคยเห็น (ดู `from` ใน Schema)
  if (order.status !== from) return { ok: false, error: "stale" };

  try {
    assertTransition(from, to, actor);
  } catch (err) {
    if (err instanceof TransitionError) return { ok: false, error: err.reason };
    throw err;
  }

  /**
   * เงื่อนไขที่ state machine ไม่รู้ — มันรู้แค่ "เส้นทางนี้มีอยู่และคนนี้กดได้ไหม"
   * ส่วนเรื่องเงินต้องเช็คที่นี่ เพราะขึ้นกับข้อมูลของออเดอร์ใบนั้น ๆ
   *
   * ทั้งสองข้อเป็นด่านฝั่ง server — UI ซ่อนปุ่มให้ก็จริง แต่ Server Action
   * ถูกเรียกตรงได้ ห้ามให้ UI เป็นชั้นป้องกันเดียว
   */
  /**
   * ออเดอร์ราคา ฿0 ตอบรับแล้วติดตาย
   *
   * `issueQuote()` ตั้งราคาได้เฉพาะก่อนตอบรับ และ `canRelease()` ต้องการ
   * `totalCents > 0` (ข้อนั้นจำเป็น — ไม่งั้นออเดอร์ ฿0 จะ "จ่ายครบ" ตั้งแต่วินาทีแรก
   * แล้วไฟล์หลุดทันทีที่แนบ) ผลคือหน้าจอขึ้น "จ่ายครบแล้ว" กับปุ่มส่งมอบที่กดไม่ได้
   * เขียนว่า "ลูกค้ายังจ่ายไม่ครบ" พร้อมกัน และไม่มีปุ่มไหนพาออกจากสภาพนั้นได้เลย
   *
   * กันที่ทางเข้าแทน — ตั้งราคาก่อนค่อยตอบรับ
   */
  if (to === "accepted" && order.totalCents <= 0) {
    return { ok: false, error: "price_missing" };
  }
  // มัดจำ (in_progress) / จ่ายครบ (delivered) — ตรงนี้แค่ตอบให้ตรงเรื่อง ด่านจริงอยู่ใน WHERE ข้างล่าง
  const blocked = moneyBlock(to, order);
  if (blocked) return { ok: false, error: blocked };
  /**
   * ขอแก้ไขเกินโควตาไม่ได้ — ตอบเป็น error ของมันเอง ไม่ใช่ `not_allowed`
   * เพราะเส้นทางนี้มีอยู่จริง แค่สิทธิ์หมด หน้าจอต้องบอกให้ไปคุยในแชท ไม่ใช่บอกว่า "ย้ายไม่ได้"
   *
   * นี่แค่ตอบให้ตรงเหตุผล ด่านจริงคือ `where` ของ update ข้างล่าง — อ่านตรงนี้แล้ว
   * กดสองแท็บพร้อมกันยังผ่านที่นี่ได้ทั้งคู่
   */
  const consuming = consumesRevision(to, actor);
  if (consuming && revisionQuota(order.revisionsUsed, order.revisionsAllowed).exhausted) {
    return { ok: false, error: "revisions_exhausted" };
  }
  /**
   * เส้นทางที่ต้องเดินผ่าน action เฉพาะ ห้ามเดินผ่านปุ่มเปลี่ยนสถานะธรรมดา
   *
   * ปุ่มพวกนี้ถูกซ่อนไปแล้วโดย `allowedNext()` แต่ Server Action ถูกเรียกตรงได้
   * และ UI ไม่ใช่ด่าน — ที่นี่คือด่านจริง
   */
  const needsAction = requiresAction(from, to);
  if (needsAction) return { ok: false, error: "use_dedicated_action" };

  /**
   * ส่งมอบต้องมีไฟล์จริง
   *
   * `deliverAndRelease()` กันข้อนี้ไว้แล้ว แต่ปุ่มเปลี่ยนสถานะบนหน้าออเดอร์
   * เรียก action ตัวนี้ ไม่ได้ผ่านตัวนั้น จึงเดินอ้อมด่านไปได้ทั้งดุ้น
   *
   * ผลตอนเจอจริงบน production: กดปุ่มเดียวแล้วออเดอร์เป็น `delivered` ทันที
   * โดยไม่มีแถว delivery เลย ลูกค้าได้แจ้งเตือนว่างานเสร็จแล้วเปิดไปเจอหน้าเปล่า
   * ซ้ำร้ายกว่านั้นคือช่องอัปโหลดของครีเอเตอร์ขึ้นเฉพาะตอน in_progress/in_review/
   * revision_requested — พอเป็น delivered แล้วจึงแนบไฟล์ตามทีหลังไม่ได้ด้วย
   * และ `delivered` ครีเอเตอร์ถอยเองไม่ได้ ต้องรอลูกค้ากดขอแก้ไขเท่านั้น
   */
  if (to === "delivered") {
    const dlv = await db.query.delivery.findFirst({
      columns: { mediaIds: true },
      where: eq(schema.delivery.orderId, order.id),
    });
    if (!dlv || dlv.mediaIds.length === 0) return { ok: false, error: "no_files" };
  }

  const now = new Date();

  /**
   * เขียนแบบ compare-and-set — `where` มี status ที่หน้าจอของคนกดเห็น (`from`) ด้วย
   *
   * ถ้าครีเอเตอร์เปิดบอร์ดไว้สองแท็บแล้วกดจากทั้งคู่ อันที่สองต้องไม่ทับ
   * เพราะสถานะที่มันเห็นตอนกดไม่ใช่สถานะจริงแล้ว — ตรวจตอนอ่านอย่างเดียวไม่พอ
   * ระหว่างอ่านกับเขียนมีช่องให้แทรกเสมอ
   *
   * ขอแก้ไข = บวก `revisions_used` ใน UPDATE เดียวกับสถานะ พร้อม `where` ว่ายังไม่เต็มโควตา
   * ⚠️ ห้ามแยกเป็นสอง query (เปลี่ยนสถานะก่อนแล้วค่อยบวก) — ถ้าตัวหลังล้ม
   * จะได้รอบแก้ฟรีที่ไม่ถูกนับ และห้ามบวกจากค่าที่อ่านมาใน JS (`used + 1`)
   * เพราะสองคำขอที่อ่านค่าเดียวกันจะเขียนเลขเดียวกันทับกัน — ให้ DB บวกเอง
   *
   * เงื่อนไขเงินก็อยู่ใน `where` ด้วยเหตุผลเดียวกัน — ยกเลิกการยืนยัน (`voidPayment`)
   * ลดยอดที่จ่ายลงได้ระหว่างที่เราอ่านกับเขียน (ดู `moneyGateSql`)
   */
  /**
   * ⚠️ ยกเลิกต้องยืนยันว่า "เห็นเรื่องเงินล่าสุดแล้ว" — ด่านนี้อยู่ที่ server ไม่ใช่แค่ dialog
   *
   * dialog เตือนตัดสินจาก snapshot ตอนหน้าโหลด ถ้าอีกฝ่ายแจ้งโอนหรือยืนยันเงินหลังจากนั้น
   * หน้าที่ค้างอยู่จะยกเลิกได้ในคลิกเดียวโดยไม่มีคำเตือน และรายการที่เพิ่งแจ้งจะค้าง
   * ตลอดกาลเพราะแผงเงินของออเดอร์ที่ยกเลิกแล้วเป็นแบบอ่านอย่างเดียว
   * บอร์ด /orders ก็ยิงมาที่นี่โดยไม่มี dialog เลย
   *
   * ผู้เรียกส่ง `moneyAck` = (จำนวนแถวเงิน, ยอดที่นับแล้ว) ที่ตัวเองเห็น ไม่ตรงของจริง = ปฏิเสธ
   * ไม่ส่งมาเลย = ถือว่าเห็นศูนย์ ซึ่งผ่านได้เฉพาะออเดอร์ที่ไม่มีเงินเกี่ยวข้องจริง ๆ
   * และเงื่อนไขเดียวกันอยู่ใน WHERE ข้างล่างด้วย เพื่อปิดช่องระหว่างอ่านกับเขียน
   */
  const ack = moneyAck ?? { rows: 0, paidCents: 0 };
  let moneyCas: ReturnType<typeof sql> | undefined;
  if (to === "cancelled") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.paymentRecord)
      .where(eq(schema.paymentRecord.orderId, order.id));
    if (n !== ack.rows || order.amountPaidCents !== ack.paidCents) {
      return { ok: false, error: "money_changed" };
    }
    moneyCas = sql`(select count(*) from payment_record p where p.order_id = ${order.id}) = ${ack.rows}
      and ${schema.order.amountPaidCents} = ${ack.paidCents}`;
  }

  /**
   * สถานะตรงแต่คนละรุ่น = ออเดอร์วนกลับมาสถานะเดิมระหว่างที่หน้าจอค้าง (ดู `version` ใน Schema)
   * เช็คหลังด่านที่บอกเหตุผลเฉพาะ (เงิน/โควตา) เพื่อให้ error ที่ตอบบอกเรื่องได้ตรงที่สุดก่อน
   * ด่านจริงอยู่ใน WHERE ข้างล่าง ตรงนี้แค่ไม่ต้องยิง UPDATE ที่รู้อยู่แล้วว่าไม่ผ่าน
   */
  if (orderVersion(order.updatedAt) !== version) return { ok: false, error: "stale" };

  /**
   * ⚠️ ล็อกแถวออเดอร์ก่อน UPDATE ใน batch เดียวกัน — ไม่ใช่ UPDATE เดี่ยว ๆ
   *
   * UPDATE เดี่ยวถ่าย snapshot ตอนเริ่มคำสั่งแล้วค่อยไปรอ lock ถ้า batch แจ้งโอนของลูกค้าถือแถวออเดอร์อยู่
   * `moneyCas` จะนับ payment_record จาก snapshot ก่อนแถวใหม่ commit แล้วผ่าน (แจ้งโอนที่ยังไม่ยืนยัน
   * ไม่เขียนแถวออเดอร์ Postgres จึงไม่เช็ค WHERE ซ้ำ) → ยกเลิกทับรายการแจ้งโอนที่ตอบไม่ได้อีกเลย
   * ล็อกก่อน = UPDATE เริ่มหลัง batch นั้น commit แล้ว เห็นแถวใหม่ แล้วตอบ `money_changed`
   * (เหตุผลเต็มอยู่ที่ lib/orders/lock.ts) ใช้กับทุกปลายทาง ไม่ใช่แค่ยกเลิก — ลำดับล็อกเดียวกับ batch เงิน
   */
  const [, updated] = await db.batch([
    lockOrder(order.id),
    db
      .update(schema.order)
      .set({
        status: to,
        updatedAt: now,
        ...(to === "completed" ? { completedAt: now } : null),
        ...(consuming ? { revisionsUsed: sql`${schema.order.revisionsUsed} + 1` } : null),
      })
      .where(
        and(
          eq(schema.order.id, order.id),
          eq(schema.order.status, from),
          // ตัดที่มิลลิวินาทีให้ตรงกับ `Date` ของ JS — เหตุผลอยู่ที่ lib/orders/version.ts
          sql`date_trunc('milliseconds', ${schema.order.updatedAt}) = ${versionIso(version)}::timestamptz`,
          consuming ? lt(schema.order.revisionsUsed, schema.order.revisionsAllowed) : undefined,
          moneyGateSql(to),
          moneyCas,
        ),
      )
      .returning({ id: schema.order.id, revisionsUsed: schema.order.revisionsUsed }),
  ]);

  /**
   * ไม่มีแถวไหนถูกเขียน = มีคนเปลี่ยนออเดอร์ไปก่อนแล้ว ตอบ `stale` ให้รีเฟรช
   * ด่านโควตาใน `where` จะตกเองได้ก็ต่อเมื่อระหว่างอ่านกับเขียนมีคนวนรอบแก้จนครบ
   * แล้วกลับมาสถานะเดิม ซึ่งรีเฟรชแล้วหน้าจอจะบอกว่าสิทธิ์หมดเอง
   *
   * ยกเว้นกรณีสถานะยังเหมือนเดิมแต่เงินลดลงระหว่างทาง — ตอบเป็น error เรื่องเงิน
   * ไม่ใช่ `stale` เพราะรีเฟรชแล้วกดใหม่ก็ไม่ผ่าน ต้องบอกให้รู้ว่าติดที่มัดจำ/ยอดค้าง
   */
  if (updated.length === 0) {
    const fresh = await db.query.order.findFirst({
      where: eq(schema.order.id, order.id),
      columns: { status: true, depositCents: true, amountPaidCents: true, totalCents: true },
    });
    const nowBlocked = fresh && fresh.status === from ? moneyBlock(to, fresh) : null;
    // สถานะยังเหมือนเดิมแต่ยกเลิกไม่ผ่าน = เงินขยับระหว่างทาง ให้หน้าจอรีเฟรชแล้วเตือนใหม่
    if (!nowBlocked && to === "cancelled" && fresh && fresh.status === from) {
      return { ok: false, error: "money_changed" };
    }
    return { ok: false, error: nowBlocked ?? "stale" };
  }

  /**
   * บันทึกลง timeline เป็น event ไม่ใช่ข้อความสำเร็จรูป
   * เก็บเป็น key + ข้อมูล แล้วค่อยแปลตอนแสดง — ถ้าเก็บเป็นข้อความไทย
   * ลูกค้าที่ใช้ภาษาอังกฤษจะเห็นไทยปนตลอดไป และแก้ย้อนหลังไม่ได้
   */
  await db.insert(schema.message).values({
    id: newId("msg"),
    orderId: order.id,
    senderUserId: session.user.id,
    isSystemEvent: true,
    eventType: "status_changed",
    /**
     * ขอแก้ไขพก "ครั้งที่เท่าไหร่ จากกี่ครั้ง" ไว้ใน event ด้วย — เธรดเป็นหลักฐานของทั้งสองฝั่ง
     * เวลาเถียงกันว่า "ขอแก้ไปกี่รอบแล้ว" ต้องชี้ได้ว่ารอบไหนนับตอนไหน
     * ใช้ค่าจาก `returning` ไม่ใช่ค่าที่อ่านไว้ก่อน เพราะนั่นคือเลขที่ DB บวกให้จริง
     */
    eventData: consuming
      ? {
          from,
          to,
          actor,
          revision: updated[0].revisionsUsed,
          revisionsAllowed: order.revisionsAllowed,
        }
      : { from, to, actor },
    createdAt: now,
  });

  /**
   * แจ้งอีกฝ่ายเสมอ ไม่ใช่คนที่กด — `notify` ตัดกรณี actor === ผู้รับ ให้อยู่แล้ว
   * ลิงก์ต่างกันตามฝั่ง เพราะสองหน้านี้เป็นคนละ route และอีกฝ่ายเข้าของอีกฝั่งไม่ได้
   */
  const recipient = actor === "creator" ? order.clientUserId : order.page.userId;
  await notify({
    userId: recipient,
    actorUserId: session.user.id,
    type: "order_status_changed",
    data: { code, from, to },
    url: actor === "creator" ? `/my/requests/${code}` : `/orders/${code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidatePath("/orders");
  revalidatePath("/dashboard");

  return { ok: true, status: to };
}

const MessageSchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  body: z.string().trim().min(1).max(4000),
});

export type SendMessageResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "not_found" | "invalid" | "rate_limited" };

/**
 * ส่งข้อความในเธรดของออเดอร์
 *
 * เธรดกับ timeline เป็นสตรีมเดียวกัน (ตาราง `message` เดียว) ข้อความคนพิมพ์
 * จึงเรียงปนกับเหตุการณ์ระบบตามเวลาจริง — ไม่ต้องให้ UI merge สองแหล่ง
 * และลูกค้าเห็นได้ทันทีว่า "ครีเอเตอร์เปลี่ยนสถานะตอนไหน เทียบกับที่คุยอะไรกันไว้"
 */
export async function sendOrderMessage(input: {
  code: string;
  body: string;
}): Promise<SendMessageResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = MessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, body } = parsed.data;

  const gate = await rateLimit(
    `msg:${session.user.id}`,
    LIMITS.sendMessage.limit,
    LIMITS.sendMessage.windowSeconds,
  );
  if (!gate.ok) return { ok: false, error: "rate_limited" };

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, clientUserId: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order) return { ok: false, error: "not_found" };

  const isCreator = order.page.userId === session.user.id;
  const isClient = order.clientUserId === session.user.id;
  // คนนอกตอบเหมือนไม่มีออเดอร์นี้ ไม่บอกว่ามีแต่เข้าไม่ได้
  if (!isCreator && !isClient) return { ok: false, error: "not_found" };

  const now = new Date();
  await db.insert(schema.message).values({
    id: newId("msg"),
    orderId: order.id,
    senderUserId: session.user.id,
    body,
    createdAt: now,
    // คนส่งถือว่าอ่านข้อความตัวเองแล้ว ไม่งั้นจะเห็นตัวเลขค้างบนงานของตัวเอง
    ...(isCreator ? { readByCreatorAt: now } : { readByClientAt: now }),
  });

  await notify({
    userId: isCreator ? order.clientUserId : order.page.userId,
    actorUserId: session.user.id,
    type: "order_message",
    data: { code, preview: body.slice(0, 60) },
    url: isCreator ? `/my/requests/${code}` : `/orders/${code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidatePath(`/orders/${code}`);
  revalidatePath(`/my/requests/${code}`);
  return { ok: true };
}

/** ทำเครื่องหมายว่าอ่านข้อความของอีกฝ่ายแล้ว — เรียกตอนเปิดหน้าเธรด */
export async function markThreadRead(code: string): Promise<void> {
  const session = await getSession();
  if (!session || !isOrderCode(code)) return;

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, clientUserId: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order) return;

  const isCreator = order.page.userId === session.user.id;
  const isClient = order.clientUserId === session.user.id;
  if (!isCreator && !isClient) return;

  const now = new Date();
  await db
    .update(schema.message)
    .set(isCreator ? { readByCreatorAt: now } : { readByClientAt: now })
    .where(
      and(
        eq(schema.message.orderId, order.id),
        isNull(isCreator ? schema.message.readByCreatorAt : schema.message.readByClientAt),
      ),
    );
}
