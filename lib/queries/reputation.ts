import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  canEditReview,
  repliedBeforeEdit,
  reviewEditableUntil,
  reviewerInitial,
} from "@/lib/reputation/review-rules";
import type { TrackRecordRaw } from "@/lib/reputation/track-record";

/**
 * Read model ของประวัติร้านและรีวิวบนหน้าร้าน (`/@handle`)
 *
 * ⚠️ หน้าสาธารณะ — กฎเดียวกับ lib/queries/creator.ts: **ตัดข้อมูลส่วนตัวตั้งแต่ในคิวรี**
 * ผลของไฟล์นี้ไม่มีชื่อลูกค้า ไม่มีวันที่เต็ม ไม่มี id ของออเดอร์/ลูกค้า มีแค่ตัวอักษรแรกกับเดือนที่สั่ง
 * ถ้าวันหนึ่งมีคนส่งผลนี้เข้าคอมโพเนนต์ `"use client"` ก็ไม่มีอะไรหลุดลง HTML เพิ่ม
 *
 * ห้ามอ่าน cookies/headers ในไฟล์นี้ — เหตุผลเดียวกับ creator.ts (เตรียมไว้ใส่ `use cache`)
 *
 * **นิยามของตัวเลขทุกตัว** (ต้องตรงกับข้อความอธิบายใต้สถิติบนหน้าร้าน):
 *   - นับเฉพาะออเดอร์ที่ร้านยืนยันรับเงินแล้วและยังนับอยู่ (`amount_paid_cents > 0`)
 *     — `recomputePaid` คิดค่านี้ใหม่จากแถวเงินใน batch เดียวกับทุกการยืนยัน/ยกเลิกการยืนยัน
 *     ร้านที่ยกเลิกการยืนยันสลิปปลอมทีหลัง ออเดอร์นั้นจึงหลุดจากสถิติเอง
 *   - งานเสร็จ = `completed`
 *   - ส่งตรงเวลา = ส่งงาน **ครั้งแรก** ≤ `due_at` (ส่งครั้งแรกเพราะรอบแก้ที่ลูกค้าขอหลังส่ง
 *     ไม่ใช่ความช้าของร้าน) ตัวหารคืองานเสร็จที่มีทั้งกำหนดส่งและ event ส่งงาน
 *   - เวลาทำงาน = ค่ากลางของ "เริ่มนับกำหนดส่ง → ส่งงานครั้งแรก" โดยจุดเริ่มคือนิยามเดียวกับ
 *     นาฬิกากำหนดส่งทั้งระบบ: `deposit_met_at` (มัดจำครบ) ถ้ามี / ออเดอร์มัดจำเก่าก่อนมีคอลัมน์นั้น
 *     ใช้การยืนยันเงินครั้งแรก / ออเดอร์ไม่มีมัดจำนับตั้งแต่สั่ง (เหมือน `dueState`)
 *   - ร้านยกเลิก = ออเดอร์ที่มีเงินเข้าแล้วและ event ยกเลิกมี `actor = creator`
 *     (`transitionOrder` เป็นทางเดียวที่เขียน `cancelled` และมันบันทึก actor จาก session เสมอ)
 *     ยกเลิกก่อนได้เงินไม่นับ — ปฏิเสธงานที่รับไม่ไหวเป็นเรื่องปกติ ยกเลิกหลังรับเงินคือสัญญาณเตือน
 *
 * ⚠️ **สิ่งที่ยังกันไม่ได้**: คนที่ยอมโอนเงินจริงวนระหว่างบัญชีตัวเองห้ารอบ ก็ปลดล็อกสถิติได้
 * (สั่งร้านตัวเองจากบัญชีเดียวกันไม่ได้ — `insertNewOrder` กัน `own_shop` ไว้แล้ว)
 * ราคาของการโกงคือเงินจริงห้าก้อนผ่านบัญชีธนาคาร ซึ่งแพงกว่ากดปุ่มฟรี ๆ มาก
 * ถ้าวันหนึ่งเจอจริง ทางต่อไปคือนับเฉพาะลูกค้าที่ไม่ซ้ำกัน (`count(distinct client_user_id)`)
 *
 * **ต้นทุน**: ต่อหนึ่งร้าน = อ่านออเดอร์ของร้านผ่าน `order_page_status_idx` แล้วต่อออเดอร์หนึ่งใบ
 * probe event สองครั้งผ่าน `message_event_idx` (partial เฉพาะ event ระบบ ไม่ไล่อ่านแชท)
 * รวมเป็น HTTP round trip เดียวด้วย `db.batch`
 * **จุดที่ต้องกลับมาแก้:** ร้านที่มีงานเสร็จหลักพัน หรือหน้าร้านช้าเกิน 300 ms —
 * ทางแก้ที่เตรียมไว้คือจำกัดเฉพาะ N งานล่าสุด หรือเก็บผลไว้ด้วย `use cache` + tag ของร้าน
 */

/** แปลงผลของ `db.execute` บน neon-http ให้เป็นแถว — รูปผลต่างกันระหว่างเรียกเดี่ยวกับใน batch */
function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] } | T[];
  return Array.isArray(r) ? r : (r.rows ?? []);
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * ออเดอร์ที่ "นับ" ของร้านนี้ — ใช้ร่วมทุกตัวเลข จะได้ไม่มีตัวไหนนับออเดอร์ไม่มีเงินหลุดเข้ามา
 * ⚠️ ต้องตรงกับ `reviewEligibility()` ใน lib/reputation/review-rules.ts (completed + มีเงินเข้า)
 */
function trackRecordSql(pageId: string) {
  return sql`
    with done as (
      select
        o.due_at,
        coalesce(
          o.deposit_met_at,
          case when o.deposit_cents > 0 then (
            select min(p.verified_at) from payment_record p
            where p.order_id = o.id
              and p.verified_at is not null and p.voided_at is null and p.rejected_at is null
          ) end,
          o.created_at
        ) as started_at,
        (
          select min(m.created_at) from message m
          where m.order_id = o.id and m.is_system_event
            and m.event_type = 'status_changed' and m.event_data->>'to' = 'delivered'
        ) as delivered_at
      from "order" o
      where o.creator_page_id = ${pageId}
        and o.status = 'completed'
        and o.amount_paid_cents > 0
    ),
    shown_reviews as (
      select r.rating from review r
      join "order" o on o.id = r.order_id
      where r.creator_page_id = ${pageId} and r.is_public
        and o.status = 'completed' and o.amount_paid_cents > 0
    )
    select
      (select count(*) from done)::int as completed,
      (select count(*) from done where due_at is not null and delivered_at is not null)::int as timed,
      (select count(*) from done where delivered_at <= due_at)::int as on_time,
      (select percentile_cont(0.5) within group (order by extract(epoch from delivered_at - started_at))
         from done where delivered_at >= started_at)::float8 as median_seconds,
      (select count(*) from "order" o
        where o.creator_page_id = ${pageId}
          and o.status = 'cancelled'
          and o.amount_paid_cents > 0
          and exists (
            select 1 from message m
            where m.order_id = o.id and m.is_system_event
              and m.event_type = 'status_changed'
              and m.event_data->>'to' = 'cancelled'
              and m.event_data->>'actor' = 'creator'
          ))::int as creator_cancelled,
      (select count(*) from shown_reviews)::int as review_count,
      (select avg(rating) from shown_reviews)::float8 as rating_avg
  `;
}

/**
 * รีวิวล่าสุดที่โชว์บนหน้าร้าน
 *
 * เดือนที่สั่งตัดตั้งแต่ใน SQL ด้วยเวลาไทย — วันที่เต็มไม่ออกจาก DB เลย
 * ชื่อลูกค้าถูกอ่านมาเพื่อทำตัวอักษรแรกใน `getShopReputation` แล้วทิ้ง ไม่อยู่ในค่าที่คืน
 * ซ่อนรีวิวของออเดอร์ที่เงินถูกยกเลิกการยืนยันจนเป็นศูนย์ (สลิปปลอม) — เงื่อนไขเดียวกับสถิติ
 */
function reviewsSql(pageId: string, limit: number) {
  return sql`
    select
      r.id, r.rating, r.body, r.creator_reply, r.creator_replied_at, r.updated_at,
      to_char(o.created_at at time zone 'Asia/Bangkok', 'YYYY-MM') as order_month,
      u.name as client_name
    from review r
    join "order" o on o.id = r.order_id
    join "user" u on u.id = r.client_user_id
    where r.creator_page_id = ${pageId} and r.is_public
      and o.status = 'completed' and o.amount_paid_cents > 0
    order by r.created_at desc
    limit ${limit}
  `;
}

export type PublicReview = {
  id: string;
  rating: number;
  body: string;
  /** ตัวอักษรแรกของชื่อลูกค้า — null = ไม่มีตัวอักษรให้ใช้ หน้าจอเขียนว่า "ลูกค้า" */
  initial: string | null;
  /** "YYYY-MM" เวลาไทย */
  orderMonth: string;
  edited: boolean;
  reply: string | null;
  repliedBeforeEdit: boolean;
};

type TrackRow = {
  completed: unknown;
  timed: unknown;
  on_time: unknown;
  median_seconds: unknown;
  creator_cancelled: unknown;
  review_count: unknown;
  rating_avg: unknown;
};

type ReviewRow = {
  id: string;
  rating: unknown;
  body: string;
  creator_reply: string;
  creator_replied_at: string | Date | null;
  updated_at: string | Date | null;
  order_month: string;
  client_name: string | null;
};

export async function getShopReputation(
  pageId: string,
  reviewLimit = 10,
): Promise<{ raw: TrackRecordRaw; reviews: PublicReview[] }> {
  const db = getDb();
  const [trackResult, reviewResult] = await db.batch([
    db.execute(trackRecordSql(pageId)),
    db.execute(reviewsSql(pageId, reviewLimit)),
  ]);

  const t = rowsOf<TrackRow>(trackResult)[0];
  const raw: TrackRecordRaw = {
    completed: num(t?.completed),
    timed: num(t?.timed),
    onTime: num(t?.on_time),
    medianSeconds: numOrNull(t?.median_seconds),
    creatorCancelled: num(t?.creator_cancelled),
    reviewCount: num(t?.review_count),
    ratingAvg: numOrNull(t?.rating_avg),
  };

  const reviews = rowsOf<ReviewRow>(reviewResult).map((r) => ({
    id: r.id,
    rating: num(r.rating),
    body: r.body,
    initial: reviewerInitial(r.client_name),
    orderMonth: r.order_month,
    edited: r.updated_at !== null,
    reply: r.creator_replied_at ? r.creator_reply : null,
    repliedBeforeEdit: repliedBeforeEdit({
      creatorRepliedAt: r.creator_replied_at,
      updatedAt: r.updated_at,
    }),
  }));

  return { raw, reviews };
}

/**
 * รีวิวของออเดอร์ใบเดียว — ใช้บนหน้าออเดอร์ของทั้งสองฝั่ง
 *
 * ⚠️ ผู้เรียกต้องพิสูจน์แล้วว่าเป็นคู่กรณีของออเดอร์นี้ (ผ่าน `getOrderForClient` /
 * `getOrderForCreator` ซึ่งกรองด้วย user id ในคิวรี) ไฟล์นี้ไม่เช็คสิทธิ์เอง
 */
export async function getReviewForOrder(orderId: string) {
  const row = await getDb().query.review.findFirst({
    where: eq(schema.review.orderId, orderId),
    columns: {
      rating: true,
      body: true,
      creatorReply: true,
      creatorRepliedAt: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  if (!row) return null;

  /**
   * เทียบเวลาที่นี่ ไม่ใช่ตอน render — เหตุผลเดียวกับ `getLiveQuote` (lib/queries/orders.ts):
   * `Date.now()` ระหว่าง render ให้ผลไม่คงที่ และฝั่ง client เทียบเองจะได้ HTML ไม่ตรงกับ server
   * ด่านจริงอยู่ที่ `editReview()` ซึ่งเทียบด้วยนาฬิกาของ Postgres
   */
  return {
    ...row,
    editable: canEditReview(row.createdAt),
    editableUntil: reviewEditableUntil(row.createdAt),
    repliedBeforeEdit: repliedBeforeEdit(row),
  };
}
