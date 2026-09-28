import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  canEditReview,
  repliedBeforeEdit,
  reviewEditableUntil,
  reviewerInitial,
} from "@/lib/reputation/review-rules";
import type { TrackRecordRaw } from "@/lib/reputation/track-record";
import { PAID_ONCE_SQL } from "@/lib/reputation/paid-once-sql";

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
 *   - นับเฉพาะออเดอร์ที่ร้าน **เคย** ยืนยันรับเงิน (`PAID_ONCE` — มีแถวเงินที่ `verified_at` ไม่ว่าง
 *     รวมแถวที่ถูกยกเลิกการยืนยันทีหลัง) ไม่ใช่ `amount_paid_cents > 0` ณ ตอนอ่าน
 *     ⚠️ เดิมใช้ยอด ณ ตอนอ่าน แล้วร้านกด "ยกเลิกการยืนยัน" (`voidPayment` ทำได้แม้ `completed`)
 *     เพื่อลบรีวิวดาวเดียวออกจากหน้าร้าน ลบงานที่ส่งช้าออกจากตัวหาร หรือลบการยกเลิกหลังรับมัดจำ
 *     ออกจากตัวเลข "ร้านยกเลิก" ได้ด้วยปุ่มเดียว — การยืนยันที่เคยเกิดขึ้นแล้วย้อนไม่ได้ ตัวเลขจึงไม่ขยับตาม
 *   - งานเสร็จ = `completed`
 *   - ส่งมอบ = ไฟล์ชุดแรกที่ลูกค้าได้รับจริง (`handover_at` ดูเหตุผลที่ `handoverSql`)
 *     ไม่ใช่ event `delivered` — event นั้นเกิดได้หลังลูกค้าจ่ายครบเท่านั้น วันที่ลูกค้าโอนงวดท้ายช้า
 *     จึงไปนับเป็นความช้าของร้าน รอบแก้ที่ **ลูกค้า** ขอหลังส่งไม่นับ (ไม่ใช่ความช้าของร้าน)
 *   - ส่งตรงเวลา = ส่งมอบ ≤ กำหนดส่ง **ระดับเวลา ไม่ใช่แค่วันที่** (ตรงกับ `dueState` ทั้งระบบ)
 *     ตัวหารคืองานเสร็จที่มีทั้งกำหนดส่งและเวลาส่งมอบ
 *   - เวลาทำงาน = ค่ากลางของ "เริ่มนับ → ส่งมอบ" จุดเริ่ม (`started_at`):
 *     ออเดอร์มีมัดจำ = ตอนที่ **ลูกค้าแจ้งโอน** จนยอดถึงมัดจำ (ดู `depositReportedSql`)
 *     ไม่ใช่ตอนร้านกดยืนยัน / ออเดอร์มัดจำเก่าก่อนมีคอลัมน์ `deposit_met_at` ใช้การยืนยันเงินครั้งแรก /
 *     ออเดอร์ไม่มีมัดจำ = ตอนตอบรับงาน (`deposit_met_at` ที่ `startClockOnAcceptSet` ตั้งพร้อมสถานะ
 *     `accepted` และเลื่อน `due_at` ไปพร้อมกัน — เหมือน `dueState`) / ออเดอร์ไม่มีมัดจำที่ตอบรับก่อนมีกติกานี้
 *     (`deposit_met_at` ว่าง) นับตั้งแต่สั่ง ซึ่งตรงกับ `due_at` ของมันที่ไม่เคยถูกเลื่อน
 *   - ร้านยกเลิก = ออเดอร์ที่ร้านเคยยืนยันเงินแล้วและ event ยกเลิกมี `actor = creator`
 *     (`transitionOrder` เป็นทางเดียวที่เขียน `cancelled` และมันบันทึก actor จาก session เสมอ)
 *     ยกเลิกก่อนได้เงินไม่นับ — ปฏิเสธงานที่รับไม่ไหวเป็นเรื่องปกติ ยกเลิกหลังรับเงินคือสัญญาณเตือน
 *     ร้านที่คืนเงินแล้วกดยกเลิกการยืนยันก่อนยกเลิกงานก็ยังนับ — ตัวเลขนี้คือ "ร้านเลิกงานหลังรับเงิน"
 *     ไม่ใช่ "ร้านไม่คืนเงิน" (ระบบไม่รู้ว่าคืนจริงไหม)
 *
 * ⚠️ **สิ่งที่ตัวเลขนี้พิสูจน์ไม่ได้: ว่ามีเงินย้ายมือจริง**
 * "ยืนยันรับเงิน" คือคำพูดของครีเอเตอร์ฝ่ายเดียว — `recordPayment` ที่ครีเอเตอร์กดเองนับทันที
 * ไม่ต้องมีสลิป และสลิปที่ลูกค้าแนบก็มีแต่ครีเอเตอร์เป็นคนตรวจ ครีเอเตอร์ที่เปิดบัญชีที่สอง (ฟรี)
 * มาสั่งร้านตัวเองห้าครั้ง แล้วกดบันทึกเงิน/ส่งงาน/ปิดงานเอง จะปลดล็อกสถิติและเขียนรีวิวห้าดาวได้
 * **โดยไม่มีเงินย้ายเลยสักบาท** (`insertNewOrder` กันแค่ user id เดียวกัน — `own_shop`)
 * แพลตฟอร์มไม่ถือเงิน (ไม่มี escrow) จึงไม่มีหลักฐานการจ่ายที่ร้านปลอมไม่ได้
 * นับเฉพาะเงินที่ลูกค้าแจ้งเองก็ไม่ช่วย — ร้านเป็นคนกดยืนยันสลิปรูปอะไรก็ได้อยู่ดี
 * สิ่งที่เงื่อนไขเงินกันได้จริงมีแค่ "ออเดอร์ที่ร้านไม่เคยอ้างว่าได้เงิน" ซึ่งกันการปั๊มยอดโดยไม่ตั้งใจ
 * ไม่ได้กันคนตั้งใจโกง ถ้าวันหนึ่งเจอจริง ทางต่อไปคือนับลูกค้าไม่ซ้ำ (`count(distinct client_user_id)`)
 * บวกอายุบัญชีลูกค้า หรือให้แอดมินตรวจ — อย่าเขียนคำอธิบายบนหน้าจอว่าตัวเลขนี้ "ยืนยันว่าจ่ายจริง"
 *
 * **ต้นทุน**: ต่อหนึ่งร้าน = อ่านออเดอร์ของร้านผ่าน `order_page_status_idx` แล้วต่อออเดอร์หนึ่งใบ
 * probe แถวเงินผ่าน `payment_order_idx` แถวส่งมอบผ่าน `delivery_order_idx` และ event ผ่าน
 * `message_event_idx` (partial เฉพาะ event ระบบ ไม่ไล่อ่านแชท) — ทุกตัวเป็นแถวไม่กี่แถวต่อออเดอร์
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
 * event ที่ **ครีเอเตอร์** เปิดรอบแก้เองหลังส่งมอบ (`delivered → revision_requested` โดย creator)
 * = ร้านบอกเองว่าไฟล์ที่ปล่อยไปก่อนหน้าใช้ไม่ได้ — ต่างจากลูกค้าขอแก้ ซึ่งไม่ใช่ความช้าของร้าน
 * ⚠️ มี `is_system_event` ใน WHERE เสมอ ไม่งั้นใช้ partial index `message_event_idx` ไม่ได้
 */
const CREATOR_REOPEN = sql`m.is_system_event
  and m.event_type = 'status_changed'
  and m.event_data->>'to' = 'revision_requested'
  and m.event_data->>'actor' = 'creator'`;

/**
 * เวลาส่งมอบที่นับให้ร้าน — ไฟล์ชุดแรกที่ลูกค้าได้รับจริงและร้านไม่ได้ถอนเอง
 *
 * ⚠️ **ไม่ใช้ event `status_changed → delivered` เป็นหลัก**: event นั้นเขียนได้ที่ `deliverAndRelease`
 * ที่เดียว และ `moneyGateSql('delivered')` ให้ผ่านเมื่อจ่ายครบแล้วเท่านั้น ออเดอร์แบ่งจ่าย
 * (มัดจำ + งวดท้าย) ร้านแนบไฟล์งานจริงไว้ตั้งแต่วันที่ 5 ลูกค้าเห็นว่ามีไฟล์รอ แต่โอนงวดท้ายวันที่ 10
 * — ถ้าใช้ event วันที่ลูกค้าโอนช้าจะไปนับเป็นความช้าของร้านทั้งหมด
 *
 * จึงดูที่แถว `delivery` แทน: แต่ละแถวคือไฟล์ชุดหนึ่งที่ **แก้ไม่ได้หลังปล่อย** (trigger ใน 0008)
 * และ `attachDelivery` เติมไฟล์ได้เฉพาะรอบที่ยังไม่ปล่อย โดยเลื่อน `created_at` เป็นเวลาที่เติมทุกครั้ง
 * เวลา `created_at` จึงเป็นเวลาที่ไฟล์ชุดนั้น (ครบชุดตามที่ปล่อย) พร้อมส่งจริง แนบไฟล์หลอกไว้ก่อนแล้วค่อยเติม
 * งานจริงทีหลังไม่ได้ประโยชน์ และแนบไว้เฉย ๆ โดยไม่ปล่อยก็ไม่ได้ประโยชน์ — นับเฉพาะแถวที่ปล่อยแล้ว
 *
 * ชุดที่ "ร้านถอนเอง" ไม่นับ: ถัดจากการปล่อยชุดนั้น (ก่อนการปล่อยชุดถัดไป) มี event ร้านเปิดรอบแก้เอง
 * — ไม่งั้นปล่อยไฟล์ชั่วคราวให้ทันกำหนดแล้วเปิดรอบแก้เองก็ได้ "ตรงเวลา" ฟรี
 * ชุดที่ปล่อยหลังร้านเคยเปิดรอบแก้เองนับที่เวลา **ปล่อย** ไม่ใช่เวลาแนบ — ออเดอร์เคย `delivered` มาแล้ว
 * แปลว่าจ่ายครบแล้ว ช่วงระหว่างแนบกับปล่อยจึงเป็นของร้านล้วน ๆ
 *
 * ออเดอร์เก่าที่ไม่มีแถว `delivery` ที่ปล่อยแล้ว (ก่อนมี `deliverAndRelease`) ถอยไปใช้ event แรกแบบเดิม
 */
const HANDOVER_AT = sql`coalesce(
  (
    select case
      when exists (
        select 1 from message m
        where m.order_id = o.id and ${CREATOR_REOPEN} and m.created_at < d.released_at
      ) then d.released_at
      else d.created_at
    end
    from delivery d
    where d.order_id = o.id and d.released_at is not null
      and not exists (
        select 1 from message m
        where m.order_id = o.id and ${CREATOR_REOPEN}
          and m.created_at > d.released_at
          and not exists (
            select 1 from delivery d2
            where d2.order_id = o.id
              and d2.released_at > d.released_at and d2.released_at < m.created_at
          )
      )
    order by d.released_at asc
    limit 1
  ),
  (
    select min(m.created_at) from message m
    where m.order_id = o.id and m.is_system_event
      and m.event_type = 'status_changed' and m.event_data->>'to' = 'delivered'
  )
)`;

/**
 * เวลาที่ **ลูกค้าแจ้งโอน** จนยอดถึงมัดจำ — ใช้แทน `deposit_met_at` ในประวัติร้าน
 *
 * ⚠️ `deposit_met_at` คือเวลาที่ **ร้านกดยืนยัน** และ `recomputePaid` เลื่อน `due_at` ไปนับจากตรงนั้น
 * ร้านที่ปล่อยรายการแจ้งโอนค้างไว้ 30 วัน (ทำงานไปเงียบ ๆ) แล้วค่อยยืนยันก่อนส่งงานวันเดียว
 * จะได้ "ตรงเวลา" และ "ไม่ถึง 1 วัน" ทั้งที่ลูกค้ารอมาเดือนหนึ่งหลังโอน ต้องนับจากฝั่งลูกค้า
 *
 * วิธีคิด: แถวเงินที่ถูกนับอยู่ ณ ตอนมัดจำครบ (ยืนยันแล้วไม่เกิน `deposit_met_at` และยังไม่ถูกยกเลิก
 * ก่อนหน้านั้น) เรียงตามเวลาที่แถวถูกสร้าง (= เวลาที่ลูกค้าแจ้ง หรือเวลาที่ร้านบันทึกเอง) แล้วหาแถวที่
 * ยอดสะสมข้ามมัดจำ — แถวเดียวที่แจ้งทีหลังไม่ดึงเวลาเริ่มให้ช้าลง และแจ้งมัดจำสองงวดก็ไม่นับจากงวดแรก
 * ไม่มีแถวไหนเข้าเงื่อนไข (ไม่ควรเกิด) = null แล้ว `least()` ใช้ `deposit_met_at` เอง
 */
const DEPOSIT_REPORTED_AT = sql`(
  select min(c.created_at) from (
    select p.created_at,
           sum(p.amount_cents) over (order by p.created_at, p.id) as running
    from payment_record p
    where p.order_id = o.id
      and p.verified_at is not null and p.verified_at <= o.deposit_met_at
      and (p.voided_at is null or p.voided_at > o.deposit_met_at)
  ) c
  where c.running >= o.deposit_cents
)`;

/**
 * ออเดอร์ที่ "นับ" ของร้านนี้ — ใช้ร่วมทุกตัวเลข จะได้ไม่มีตัวไหนนับออเดอร์ไม่มีเงินหลุดเข้ามา
 * ⚠️ ต้องตรงกับ `reviewEligibility()` ใน lib/reputation/review-rules.ts (completed + `PAID_ONCE_SQL`)
 *
 * กำหนดส่งที่ใช้ตัดสิน "ตรงเวลา" ไม่ใช่ `due_at` ตรง ๆ สำหรับออเดอร์ที่มี `deposit_met_at`:
 * `recomputePaid` เลื่อน `due_at` ไปเป็น `deposit_met_at + ระยะงาน` ตอนร้านกดยืนยัน ที่นี่ถอยกลับ
 * เท่ากับช่วงที่ร้านปล่อยรายการแจ้งโอนค้างไว้ — ระยะงานเท่าเดิม แค่เริ่มนับจากตอนลูกค้าแจ้งโอน
 * ออเดอร์ไม่มีมัดจำ `started_at = deposit_met_at` พอดี ช่วงที่ถอยจึงเป็นศูนย์ = `due_at` ที่เลื่อนตอนตอบรับ
 * (ร้านเลือกเวลาตอบรับเองได้ก็จริง แต่ก่อนตอบรับงานยังไม่ใช่ของร้าน — กติกาเดียวกับหน้าออเดอร์)
 * ⚠️ ผลคือกำหนดส่งในสถิติอาจเร็วกว่าวันที่ที่หน้าออเดอร์โชว์ ถ้าร้านยืนยันเงินช้า — ตั้งใจแบบนั้น
 */
function trackRecordSql(pageId: string) {
  return sql`
    with base as (
      select
        o.due_at,
        o.deposit_met_at,
        coalesce(
          -- ไม่มีมัดจำ = deposit_met_at คือตอนตอบรับงานตรง ๆ ไม่ถอยไปหาเวลาแจ้งโอน
          -- ⚠️ ห้ามผ่าน DEPOSIT_REPORTED_AT: เส้นมัดจำ 0 ทำให้แถวเงินแถวแรกข้ามเส้นเสมอ ถ้าวันหนึ่ง
          -- มีทางจ่ายก่อนตอบรับ จุดเริ่มจะถอยไปก่อนตอบรับ ทั้งที่ due_at นับจากตอนตอบรับ
          case when o.deposit_cents > 0
            then least(o.deposit_met_at, ${DEPOSIT_REPORTED_AT})
            else o.deposit_met_at
          end,
          case when o.deposit_cents > 0 then (
            select min(p.verified_at) from payment_record p
            where p.order_id = o.id
              and p.verified_at is not null and p.voided_at is null and p.rejected_at is null
          ) end,
          o.created_at
        ) as started_at,
        ${HANDOVER_AT} as handover_at
      from "order" o
      where o.creator_page_id = ${pageId}
        and o.status = 'completed'
        and ${PAID_ONCE_SQL}
    ),
    done as (
      select
        started_at,
        handover_at,
        -- กำหนดส่งถอยกลับเท่ากับช่วงที่ร้านปล่อยรายการแจ้งโอนค้างไว้ (ดูหมายเหตุเหนือฟังก์ชัน)
        case when deposit_met_at is not null
          then due_at - (deposit_met_at - started_at)
          else due_at
        end as due_at
      from base
    ),
    shown_reviews as (
      select r.rating from review r
      join "order" o on o.id = r.order_id
      where r.creator_page_id = ${pageId} and r.is_public
        and o.status = 'completed' and ${PAID_ONCE_SQL}
    )
    select
      (select count(*) from done)::int as completed,
      (select count(*) from done where due_at is not null and handover_at is not null)::int as timed,
      (select count(*) from done where handover_at <= due_at)::int as on_time,
      -- แนบไฟล์ไว้ก่อนเริ่มนับ (งานสำเร็จรูป) = 0 วินาที ไม่ใช่ค่าติดลบที่ถูกทิ้งไปเงียบ ๆ
      (select percentile_cont(0.5) within group (
          order by extract(epoch from greatest(handover_at - started_at, interval '0'))
        ) from done where handover_at is not null)::float8 as median_seconds,
      (select count(*) from "order" o
        where o.creator_page_id = ${pageId}
          and o.status = 'cancelled'
          and ${PAID_ONCE_SQL}
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
 *
 * ⚠️ เงื่อนไขเงินคือ `PAID_ONCE_SQL` ไม่ใช่ยอด ณ ตอนอ่าน — รีวิวที่เขียนแล้วต้องไม่หายเพราะร้านกด
 * "ยกเลิกการยืนยัน" ทีหลัง (ทำได้แม้งาน `completed`) ลูกค้าเห็นรีวิวตัวเองบนหน้าออเดอร์เสมอ
 * จึงไม่มีทางรู้ว่าถูกซ่อน คนเดียวที่ซ่อนรีวิวได้คือลูกค้าเอง (`is_public` ผ่าน `setReviewPublic`)
 * กรณีสลิปปลอมจริง ร้านตอบใต้รีวิวอธิบายได้ — ดีกว่าให้ร้านลบรีวิวที่ไม่ชอบได้ด้วยปุ่มเดียว
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
      and o.status = 'completed' and ${PAID_ONCE_SQL}
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
      isPublic: true,
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
