"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications/create";
import { isOrderCode } from "@/lib/orders/code";
import {
  paidOnce,
  REVIEW_BODY_MAX,
  REVIEW_EDIT_DAYS,
  REVIEW_REPLY_MAX,
  reviewEligibility,
} from "./review-rules";
import { PAID_ONCE_SQL } from "./paid-once-sql";

/**
 * รีวิวและคำตอบของร้าน
 *
 * ⚠️ **ตัวตนมาจาก session เท่านั้น** — ไม่รับ user id, page id หรือ review id จาก client
 * ทุก action รับแค่ `code` ของออเดอร์ แล้วพิสูจน์บทบาทสองชั้น:
 *   1. อ่านออเดอร์ด้วย code **คู่กับ** user id ของ session (ไม่ใช่อ่านก่อนแล้วค่อยเทียบทีหลัง)
 *      คนนอกได้ `not_found` เหมือนออเดอร์ไม่มีอยู่จริง — ไม่บอกว่ามีแต่เข้าไม่ได้
 *   2. เงื่อนไขเดียวกันอยู่ใน WHERE ของคำสั่งเขียนด้วย ช่องระหว่างอ่านกับเขียนจึงไม่มีผล
 *
 * ทุกการเขียนเป็นคำสั่งเดียวแบบ compare-and-set (neon-http ไม่มี interactive transaction):
 *   - เขียนครั้งแรก = `insert ... select from order where <มีสิทธิ์>` + `on conflict do nothing`
 *     unique ของ `review.order_id` คือด่าน "หนึ่งออเดอร์หนึ่งรีวิว" — สองแท็บกดพร้อมกันได้แถวเดียว
 *   - แก้ = UPDATE ที่ WHERE มีช่วง 7 วันนับจาก `created_at` ตามนาฬิกาของ Postgres
 *   - ตอบ = UPDATE ที่ WHERE มี `creator_replied_at is null` — ตอบซ้ำจากสองแท็บผ่านได้ครั้งเดียว
 *   - ซ่อน/เปิด = UPDATE `is_public` ที่ WHERE มี `client_user_id` ของ session
 */

const ReviewSchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(REVIEW_BODY_MAX),
});

const VisibilitySchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  isPublic: z.boolean(),
});

const ReplySchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  body: z.string().trim().min(1).max(REVIEW_REPLY_MAX),
});

export type ReviewResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "not_found"
        | "invalid"
        | "rate_limited"
        /** งานยังไม่เสร็จ (หรือจบแบบไม่ได้งาน) */
        | "not_completed"
        /** จบแล้วแต่ร้านไม่เคยยืนยันรับเงินเลย */
        | "unpaid"
        /** ออเดอร์นี้มีรีวิวแล้ว — ให้หน้าจอรีเฟรชไปโหมดแก้ไข */
        | "exists"
        /** เลย 7 วันนับจากเขียนครั้งแรกแล้ว */
        | "edit_closed"
        /** ร้านตอบรีวิวนี้ไปแล้ว — ตอบได้ครั้งเดียว */
        | "already_replied";
    };

async function gate(userId: string): Promise<boolean> {
  const res = await rateLimit(`review:${userId}`, LIMITS.review.limit, LIMITS.review.windowSeconds);
  return res.ok;
}

/** ออเดอร์ที่ผู้ใช้คนนี้เป็น **ลูกค้า** — กรองด้วย user id ในคิวรีเดียว */
async function clientOrder(code: string, userId: string) {
  const o = await getDb().query.order.findFirst({
    where: and(eq(schema.order.code, code), eq(schema.order.clientUserId, userId)),
    columns: { id: true, status: true },
    with: {
      page: { columns: { userId: true } },
      payments: { columns: { verifiedAt: true } },
    },
  });
  return o ? { ...o, paidOnce: paidOnce(o.payments) } : undefined;
}

function revalidateOrder(code: string) {
  revalidatePath(`/my/requests/${code}`);
  revalidatePath(`/orders/${code}`);
}

/**
 * ลูกค้าเขียนรีวิวครั้งแรก — ได้เมื่องานเสร็จและร้านเคยยืนยันรับเงินแล้วเท่านั้น
 *
 * ⚠️ เงื่อนไข `completed + PAID_ONCE_SQL` อยู่ใน SELECT ของ INSERT ไม่ใช่แค่เช็คใน JS
 * ต้องตรงกับ `reviewEligibility()`
 * ⚠️ ไม่ใช่ `amount_paid_cents > 0` — ร้านกด "ยกเลิกการยืนยัน" บนงานที่เสร็จแล้วได้
 * ถ้าใช้ยอด ณ ตอนนี้ ร้านจะกันลูกค้าที่ยังไม่ได้เขียนรีวิวไม่ให้เขียนได้ด้วยปุ่มเดียว
 */
export async function createReview(input: {
  code: string;
  rating: number;
  body: string;
}): Promise<ReviewResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, rating, body } = parsed.data;
  const userId = session.user.id;

  if (!(await gate(userId))) return { ok: false, error: "rate_limited" };

  const order = await clientOrder(code, userId);
  if (!order) return { ok: false, error: "not_found" };

  // แค่ตอบให้ตรงเรื่อง — ด่านจริงอยู่ใน WHERE ข้างล่าง
  const eligible = reviewEligibility(order);
  if (eligible !== "ok") return { ok: false, error: eligible };

  const db = getDb();
  const inserted = await db.execute(sql`
    insert into review (id, order_id, creator_page_id, client_user_id, rating, body)
    select ${newId("rev")}::text, o.id, o.creator_page_id, o.client_user_id, ${rating}::int, ${body}::text
    from "order" o
    where o.id = ${order.id}
      and o.client_user_id = ${userId}
      and o.status = 'completed'
      and ${PAID_ONCE_SQL}
    on conflict (order_id) do nothing
    returning id
  `);
  const wrote = ((inserted as { rows?: unknown[] }).rows ?? []).length > 0;

  if (!wrote) {
    // ไม่มีแถวถูกเขียน: มีรีวิวอยู่แล้ว หรือสถานะ/เงินเปลี่ยนระหว่างทาง — ตอบให้ตรงอย่างใดอย่างหนึ่ง
    const existing = await db.query.review.findFirst({
      where: eq(schema.review.orderId, order.id),
      columns: { id: true },
    });
    if (existing) return { ok: false, error: "exists" };
    const fresh = await clientOrder(code, userId);
    const now = fresh ? reviewEligibility(fresh) : "not_completed";
    return { ok: false, error: now === "ok" ? "not_found" : now };
  }

  await notify({
    userId: order.page.userId,
    actorUserId: userId,
    type: "review_posted",
    data: { code },
    url: `/orders/${code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidateOrder(code);
  return { ok: true };
}

/**
 * ลูกค้าแก้รีวิวของตัวเอง — ภายใน 7 วันนับจากเขียนครั้งแรก
 *
 * ไม่แจ้งเตือนร้านเมื่อแก้ — แก้คำผิดสามรอบ = กระดิ่งสามครั้งโดยไม่มีอะไรให้ทำ
 * หน้าร้านบอกเองว่า "แก้ไขแล้ว" และบอกว่าร้านตอบก่อนการแก้หรือไม่ (`repliedBeforeEdit`)
 */
export async function editReview(input: {
  code: string;
  rating: number;
  body: string;
}): Promise<ReviewResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, rating, body } = parsed.data;
  const userId = session.user.id;

  if (!(await gate(userId))) return { ok: false, error: "rate_limited" };

  const order = await clientOrder(code, userId);
  if (!order) return { ok: false, error: "not_found" };

  const db = getDb();
  /**
   * ⚠️ ช่วงแก้ได้คิดด้วย `now()` ของ Postgres เทียบกับ `created_at` ที่ Postgres เขียนเอง
   * นาฬิกาเดียวกันทั้งสองฝั่ง — ถ้าใช้ `new Date()` ของเครื่องที่รันโค้ด ขอบ 7 วันจะเพี้ยนตามนาฬิกาเครื่อง
   * ตรงกับ `canEditReview()` ใน review-rules.ts (หน้าจอใช้ตัดสินว่าจะโชว์ปุ่มแก้ไหม)
   */
  /**
   * ⚠️ `updated_at` ขยับเฉพาะเมื่อดาวหรือข้อความเปลี่ยนจริง — กด "บันทึก" โดยไม่แก้อะไร
   * ต้องไม่ทำให้หน้าร้านขึ้น "แก้ไขแล้ว" และ "ร้านตอบก่อนลูกค้าแก้ไขรีวิวนี้" (`repliedBeforeEdit`)
   * ซึ่งบอกคนอ่านว่ารีวิวเปลี่ยนหลังร้านตอบ ทั้งที่ไม่ได้เปลี่ยน
   * ใช้ CASE ใน SET แทนการใส่ใน WHERE: บันทึกซ้ำภายใน 7 วันยังตอบ ok ส่วนหลัง 7 วันยังตอบ edit_closed
   * (ใน SET คอลัมน์ทางขวาคือค่าก่อนเขียน จึงเทียบค่าเก่ากับค่าใหม่ได้ในคำสั่งเดียว)
   */
  const updated = await db
    .update(schema.review)
    .set({
      rating,
      body,
      updatedAt: sql`case
        when (${schema.review.rating}, ${schema.review.body}) is distinct from (${rating}::int, ${body}::text)
        then now() else ${schema.review.updatedAt} end`,
    })
    .where(
      and(
        eq(schema.review.orderId, order.id),
        eq(schema.review.clientUserId, userId),
        sql`${schema.review.createdAt} > now() - make_interval(days => ${REVIEW_EDIT_DAYS})`,
      ),
    )
    .returning({ id: schema.review.id });

  if (updated.length === 0) {
    const existing = await db.query.review.findFirst({
      where: and(eq(schema.review.orderId, order.id), eq(schema.review.clientUserId, userId)),
      columns: { id: true },
    });
    return { ok: false, error: existing ? "edit_closed" : "not_found" };
  }

  revalidateOrder(code);
  return { ok: true };
}

/**
 * ลูกค้าซ่อนรีวิวของตัวเองจากหน้าร้าน หรือเปิดกลับ — ได้ตลอด ไม่มีกรอบ 7 วัน
 *
 * ทำไมต้องมี: คำตอบของร้านขึ้นใต้รีวิวบนหน้าสาธารณะ ตอบได้ครั้งเดียวและแก้/ลบไม่ได้
 * ร้านที่ไม่พอใจจึงเขียนชื่อจริง อีเมล หรือรายละเอียดออเดอร์ของลูกค้าลงไปได้ถาวร — ขัดกับที่หน้าร้าน
 * โชว์แค่ตัวอักษรแรกของชื่อ คำตอบโชว์เฉพาะใต้รีวิวที่ `is_public` (lib/queries/reputation.ts)
 * ลูกค้าซ่อนรีวิวตัวเองได้ = เอาคำตอบนั้นลงจากหน้าร้านได้เองโดยไม่ต้องรอใคร
 *
 * ไม่ลบแถวทิ้ง: สองฝ่ายยังเห็นรีวิวและคำตอบบนหน้าออเดอร์เป็นหลักฐาน และเปิดกลับได้ถ้ากดผิด
 * ซ่อนแล้วไม่นับในคะแนนเฉลี่ยของร้าน (`shown_reviews` กรอง `is_public` เหมือนรายการรีวิว)
 * ไม่แจ้งเตือนร้าน — หน้าออเดอร์ฝั่งร้านบอกเองว่ารีวิวถูกซ่อนอยู่
 * ⚠️ ร้านไม่มีทางแตะคอลัมน์นี้ — WHERE ผูกกับ `client_user_id` ของ session
 */
export async function setReviewPublic(input: {
  code: string;
  isPublic: boolean;
}): Promise<ReviewResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const parsed = VisibilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, isPublic } = parsed.data;
  const userId = session.user.id;

  if (!(await gate(userId))) return { ok: false, error: "rate_limited" };

  const order = await clientOrder(code, userId);
  if (!order) return { ok: false, error: "not_found" };

  // กดซ้ำ/สองแท็บ = เขียนค่าเดิมทับ ผลเหมือนกัน ไม่ต้องมี compare-and-set
  const updated = await getDb()
    .update(schema.review)
    .set({ isPublic })
    .where(and(eq(schema.review.orderId, order.id), eq(schema.review.clientUserId, userId)))
    .returning({ id: schema.review.id });
  if (updated.length === 0) return { ok: false, error: "not_found" };

  revalidateOrder(code);
  return { ok: true };
}

/**
 * เจ้าของร้านตอบรีวิว — **ครั้งเดียว แก้ไม่ได้**
 *
 * ตอบครั้งเดียวเพื่อไม่ให้หน้าร้านกลายเป็นที่เถียงกันไปมา และคำตอบที่ลูกค้าอ่านไปแล้ว
 * ต้องไม่ถูกเปลี่ยนทีหลัง เรื่องที่ต้องคุยต่อมีเธรดของออเดอร์อยู่แล้ว
 * ⚠️ คำตอบเป็นข้อความอิสระบนหน้าสาธารณะ — ทางเอาลงคือลูกค้าซ่อนรีวิวตัวเอง (`setReviewPublic`)
 * ยังไม่มีปุ่มซ่อนฝั่งแอดมิน ถ้าต้องการต้องแก้ใน DB (`is_public = false`)
 */
export async function replyToReview(input: { code: string; body: string }): Promise<ReviewResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const parsed = ReplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, body } = parsed.data;
  const userId = session.user.id;

  if (!(await gate(userId))) return { ok: false, error: "rate_limited" };

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, clientUserId: true },
    with: { page: { columns: { userId: true } } },
  });
  // ไม่ใช่ร้านของเรา = ตอบเหมือนไม่มีออเดอร์นี้ (ลูกค้าของออเดอร์ก็ตอบรีวิวตัวเองไม่ได้)
  if (!order || order.page.userId !== userId) return { ok: false, error: "not_found" };

  /**
   * compare-and-set: ยังไม่เคยตอบ + รีวิวเป็นของร้านที่คนกดเป็นเจ้าของ ณ ตอนเขียน
   * `creator_reply = ''` กันแถวเก่าที่อาจมีคำตอบโดยไม่มีเวลากำกับ (คอลัมน์เวลาเพิ่งเพิ่มทีหลัง)
   */
  const updated = await db
    .update(schema.review)
    .set({ creatorReply: body, creatorRepliedAt: sql`now()` })
    .where(
      and(
        eq(schema.review.orderId, order.id),
        isNull(schema.review.creatorRepliedAt),
        eq(schema.review.creatorReply, ""),
        sql`exists (
          select 1 from creator_page p
          where p.id = ${schema.review.creatorPageId} and p.user_id = ${userId}
        )`,
      ),
    )
    .returning({ id: schema.review.id });

  if (updated.length === 0) {
    const existing = await db.query.review.findFirst({
      where: eq(schema.review.orderId, order.id),
      columns: { id: true },
    });
    return { ok: false, error: existing ? "already_replied" : "not_found" };
  }

  await notify({
    userId: order.clientUserId,
    actorUserId: userId,
    type: "review_replied",
    data: { code },
    url: `/my/requests/${code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidateOrder(code);
  return { ok: true };
}
