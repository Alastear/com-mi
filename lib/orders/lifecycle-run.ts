import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { notify } from "@/lib/notifications/create";
import type { OrderStatus } from "@/lib/types";
import { moneyGateSql } from "./release-sql";
import { assertTransition } from "./state-machine";
import {
  AUTO_COMPLETE_NOTICE_DAYS,
  AUTO_COMPLETE_WARN_MS,
  LIFECYCLE_LIMIT,
  QUOTE_GRACE_MS,
  REQUEST_TTL_MS,
  decideLifecycle,
  type LifecycleOrder,
} from "./lifecycle";

/**
 * ขั้น "วงจรชีวิตออเดอร์" ของ cron รายวัน (app/api/cron/cleanup) — ตัวที่ลงมือเขียนจริง
 *
 * กติกาทั้งหมดอยู่ใน lib/orders/lifecycle.ts (ทดสอบได้โดยไม่มี DB) ไฟล์นี้ทำสามอย่าง:
 *   1. หยิบออเดอร์ที่ "อาจจะ" ถึงเวลา — SQL กรองรอบแรกด้วยเงื่อนไขเดียวกับกติกา + LIMIT
 *   2. ให้ `decideLifecycle()` ตัดสิน
 *   3. เขียนแบบ compare-and-set: ทุกอย่างที่อ่านมาต้องยังเหมือนเดิมตอนเขียน ไม่งั้นข้ามไปรอบหน้า
 *
 * **รันซ้ำได้เสมอ** (idempotent): ออเดอร์ที่ย้ายไปแล้วไม่ผ่านตัวกรองอีก คำเตือนที่ส่งแล้ว
 * ถูกจดไว้ที่ `autoCompleteWarnedAt` และทุกการเขียนมีเงื่อนไขว่า "ยังเหมือนตอนที่อ่าน"
 * cron ยิงซ้ำสองรอบพร้อมกันก็ได้ผลเท่ารอบเดียว
 *
 * ⚠️ neon-http ไม่มี interactive transaction — แต่ละออเดอร์เป็น `db.batch()` ของตัวเอง
 * ขึ้นต้นด้วยล็อกแถวออเดอร์เหมือนทุก batch เรื่องเงินใน lib/payments/actions.ts
 * คำสั่งถัดไปจึงเห็นรายการเงิน/ข้อความที่ commit ก่อนเราได้ล็อก (READ COMMITTED ถ่าย snapshot ใหม่ทุกคำสั่ง)
 */

export type LifecycleReport = {
  /** ออเดอร์ที่ผ่านตัวกรองรอบแรก (รวมทุกกติกา) */
  scanned: number;
  expiredRequests: string[];
  expiredQuotes: string[];
  warned: string[];
  completed: string[];
  /** ตัดสินแล้วว่าต้องทำ แต่เขียนไม่ผ่านเพราะมีอะไรเปลี่ยนระหว่างอ่านกับเขียน — รอบหน้าลองใหม่ */
  skippedChanged: string[];
  errors: string[];
};

/** แถวที่ตัวกรองรอบแรกคืนมา — เวลาอยู่สองรูป: ms สำหรับกติกา และข้อความดิบสำหรับ compare-and-set */
type Candidate = {
  id: string;
  code: string;
  status: string;
  client_user_id: string;
  creator_user_id: string;
  total_cents: number | string;
  amount_paid_cents: number | string;
  has_pending: boolean | string;
  updated_ms: number | string;
  warned_ms: number | string | null;
  last_creator_ms: number | string | null;
  last_client_ms: number | string | null;
  quote_expires_ms: number | string | null;
  /**
   * ⚠️ ค่าดิบจาก Postgres (`::text`) ไม่ใช่ `Date` — ใช้เทียบเท่ากันใน WHERE เท่านั้น
   * `Date` ของ JS ละเอียดแค่มิลลิวินาที แต่ timestamptz ละเอียดถึงไมโครวินาที
   * แถวที่เขียนด้วย `now()` ของ Postgres จะเทียบด้วย Date ไม่เคยเท่ากันเลย แล้วออเดอร์นั้นจะค้างตลอดกาล
   */
  updated_raw: string;
  warned_raw: string | null;
  last_msg_raw: string | null;
};

const ms = (v: number | string | null): Date | null => (v === null ? null : new Date(Number(v)));

function toLifecycle(c: Candidate): LifecycleOrder {
  return {
    status: c.status as OrderStatus,
    updatedAt: ms(c.updated_ms)!,
    lastCreatorMessageAt: ms(c.last_creator_ms),
    lastClientMessageAt: ms(c.last_client_ms),
    liveQuoteExpiresAt: ms(c.quote_expires_ms),
    totalCents: Number(c.total_cents),
    amountPaidCents: Number(c.amount_paid_cents),
    hasPendingPayment: c.has_pending === true || c.has_pending === "t" || c.has_pending === "true",
    autoCompleteWarnedAt: ms(c.warned_ms),
  };
}

/* ── ตัวกรองรอบแรก ──────────────────────────────────────────────── */

/**
 * ตัวกรองต่อสถานะ — **ต้องหลวมกว่าหรือเท่ากับกติกาใน lifecycle.ts** ไม่งั้นออเดอร์ที่ถึงเวลาแล้วไม่ถูกหยิบ
 * และต้องแน่นพอให้ LIMIT ไม่หมดไปกับออเดอร์ที่ยังไม่ถึงเวลา (ไม่งั้นใบที่ถึงเวลาจริงรอคิวไปเรื่อย ๆ)
 *
 * `greatest()` ของ Postgres ข้าม null ให้เอง — ตรงกับ `latest()` ในฝั่งกติกา
 * `order by` = จุดเริ่มนับเก่าสุดก่อน ใบที่ค้างนานที่สุดได้คิวก่อนเสมอ
 */
function filterFor(status: "requested" | "quoted" | "delivered", now: Date): { where: SQL; order: SQL } {
  const cutoff = (ago: number) => sql`${new Date(now.getTime() - ago).toISOString()}::timestamptz`;
  switch (status) {
    case "requested":
      return {
        where: sql`greatest(c.updated_at, c.last_creator_at) <= ${cutoff(REQUEST_TTL_MS)}`,
        order: sql`greatest(c.updated_at, c.last_creator_at)`,
      };
    case "quoted":
      return {
        where: sql`c.quote_expires_at is not null
          and c.quote_expires_at <= ${now.toISOString()}::timestamptz
          and greatest(c.quote_expires_at, c.updated_at, c.last_creator_at, c.last_client_at)
              <= ${cutoff(QUOTE_GRACE_MS)}`,
        order: sql`greatest(c.quote_expires_at, c.updated_at, c.last_creator_at, c.last_client_at)`,
      };
    case "delivered":
      // หยิบตั้งแต่ถึงวันเตือน — ใบที่เตือนแล้วรอครบกำหนดก็อยู่ในชุดนี้ (มีไม่เกิน 2 วันก็ออกไปเอง)
      return {
        where: sql`c.total_cents > 0 and c.amount_paid_cents >= c.total_cents and not c.has_pending
          and greatest(c.updated_at, c.last_client_at) <= ${cutoff(AUTO_COMPLETE_WARN_MS)}`,
        order: sql`greatest(c.updated_at, c.last_client_at)`,
      };
  }
}

async function loadCandidates(
  status: "requested" | "quoted" | "delivered",
  now: Date,
  limit: number,
  codes: readonly string[] | null,
): Promise<Candidate[]> {
  const { where, order } = filterFor(status, now);
  const onlyCodes =
    codes && codes.length > 0
      ? sql`and o.code in (${sql.join(
          codes.map((c) => sql`${c}`),
          sql`, `,
        )})`
      : sql``;
  const epoch = (col: SQL) => sql`(extract(epoch from ${col}) * 1000)::float8`;

  const result = await getDb().execute<Candidate>(sql`
    select c.id, c.code, c.status, c.client_user_id, c.creator_user_id,
           c.total_cents, c.amount_paid_cents, c.has_pending,
           ${epoch(sql`c.updated_at`)} as updated_ms,
           ${epoch(sql`c.warned_at`)} as warned_ms,
           ${epoch(sql`c.last_creator_at`)} as last_creator_ms,
           ${epoch(sql`c.last_client_at`)} as last_client_ms,
           ${epoch(sql`c.quote_expires_at`)} as quote_expires_ms,
           c.updated_at::text as updated_raw,
           c.warned_at::text as warned_raw,
           c.last_msg_at::text as last_msg_raw
    from (
      select o.id, o.code, o.status, o.client_user_id, p.user_id as creator_user_id,
             o.total_cents, o.amount_paid_cents, o.updated_at,
             o.auto_complete_warned_at as warned_at,
             -- ข้อความที่คนพิมพ์ แยกตามฝั่ง (event ระบบไม่นับเป็นการกระทำของใคร)
             (select max(m.created_at) from message m
               where m.order_id = o.id and not m.is_system_event and m.sender_user_id = p.user_id)
               as last_creator_at,
             (select max(m.created_at) from message m
               where m.order_id = o.id and not m.is_system_event and m.sender_user_id = o.client_user_id)
               as last_client_at,
             -- ทุกข้อความรวม event — ใช้เป็น "ยังเหมือนเดิมไหม" ตอนเขียน (ทุกการเปลี่ยนสถานะ/เงินมี event)
             (select max(m.created_at) from message m where m.order_id = o.id) as last_msg_at,
             (select q.expires_at from order_quote q
               where q.order_id = o.id and q.superseded_at is null and q.accepted_at is null
               order by q.created_at desc limit 1) as quote_expires_at,
             -- รอครีเอเตอร์ตอบ = ยังไม่ยืนยันและยังไม่ปฏิเสธ (นิยามเดียวกับ noPending ใน recordPayment)
             exists (select 1 from payment_record r
               where r.order_id = o.id and r.verified_at is null and r.rejected_at is null)
               as has_pending
      from "order" o
      join creator_page p on p.id = o.creator_page_id
      where o.status = ${status} ${onlyCodes}
    ) c
    where ${where}
    order by ${order} asc
    limit ${limit}
  `);
  return result.rows;
}

/* ── การเขียน ──────────────────────────────────────────────────── */

/** ล็อกแถวออเดอร์ไว้จนจบ batch — ลำดับเดียวกับทุก batch เรื่องเงิน (ออเดอร์ก่อนเสมอ) */
function lockOrder(orderId: string) {
  return getDb().execute(sql`select id from "order" where id = ${orderId} for update`);
}

/**
 * "ยังเหมือนตอนที่อ่าน" — ใส่ใน WHERE ของทุกการเขียน
 *
 * `updated_at` ขยับทุกครั้งที่สถานะหรือยอดเงินเปลี่ยน และทุกการกระทำของคน (เปลี่ยนสถานะ เงิน
 * ใบเสนอราคา แชท) เพิ่มแถวในตาราง message — มีแถวใหม่กว่าที่เห็น = มีคนทำอะไรไปแล้ว
 * ห้ามตัดสินแทนเขาจากข้อมูลเก่า ข้ามไปก่อน พรุ่งนี้ค่อยดูใหม่
 */
function unchangedSql(c: Candidate): SQL {
  const o = schema.order;
  return sql`${o.updatedAt} = ${c.updated_raw}::timestamptz
    and not exists (
      select 1 from message m
      where m.order_id = ${o.id}
        and (${c.last_msg_raw}::timestamptz is null or m.created_at > ${c.last_msg_raw}::timestamptz)
    )`;
}

/**
 * event บน timeline ของการเปลี่ยนสถานะโดยระบบ — อยู่ในคำสั่งเดียวกับ UPDATE (CTE)
 * เขียนสำเร็จเท่านั้นถึงมี event ไม่มีทางได้ event ลอย ๆ บนออเดอร์ที่ไม่ได้ย้ายจริง
 * `sender_user_id` เป็น null = ไม่มีคนกด เธรดขึ้น "โดยระบบ" จาก `actor: "system"`
 */
function eventFromCte(eventType: string, data: Record<string, string | number>, at: string): SQL {
  return sql`
    insert into message (id, order_id, sender_user_id, is_system_event, event_type, event_data, created_at)
    select ${newId("msg")}::text, moved.id, null, true, ${eventType}::text,
           ${JSON.stringify(data)}::jsonb, ${at}::timestamptz
    from moved
    returning order_id`;
}

function rowCount(result: unknown): number {
  const r = result as { rows?: unknown[]; rowCount?: number | null };
  return r.rows?.length ?? r.rowCount ?? 0;
}

async function moveBySystem(
  c: Candidate,
  from: "requested" | "quoted" | "delivered",
  to: "expired" | "completed",
  now: Date,
  extra: SQL | undefined,
): Promise<boolean> {
  // ด่านเดียวกับทุกการเปลี่ยนสถานะ — ถ้าวันหนึ่งมีคนลบเส้นของ system ออกจาก state machine ต้องหยุดตรงนี้
  assertTransition(from, to, "system");

  const db = getDb();
  const o = schema.order;
  const at = now.toISOString();
  const [, moved] = await db.batch([
    lockOrder(c.id),
    db.execute(sql`
      with moved as (
        update "order"
        set status = ${to}, updated_at = ${at}::timestamptz
            ${to === "completed" ? sql`, completed_at = ${at}::timestamptz` : sql``}
        where ${o.id} = ${c.id} and ${o.status} = ${from}
          and ${unchangedSql(c)}
          ${extra ? sql`and ${extra}` : sql``}
        returning "order".id
      )
      ${eventFromCte("status_changed", { from, to, actor: "system" }, at)}
    `),
  ]);
  if (rowCount(moved) === 0) return false;

  /**
   * แจ้งทั้งสองฝ่าย — ไม่มีใครกด จึงไม่มี "อีกฝ่าย" ให้ตัดทิ้ง
   * อีเมลตัดสินที่ `emailKindFor()` เหมือนทุกการเปลี่ยนสถานะ (หมดอายุ/ปิดงาน ดูในกระดิ่งพอ)
   */
  for (const [userId, url] of [
    [c.client_user_id, `/my/requests/${c.code}`],
    [c.creator_user_id, `/orders/${c.code}`],
  ] as const) {
    await notify({
      userId,
      type: "order_status_changed",
      data: { code: c.code, from, to },
      url,
      entityType: "order",
      entityId: c.id,
    });
  }
  return true;
}

/**
 * ส่งงานแล้ว → ปิดงาน: ด่านเงินอยู่ใน WHERE ด้วย ไม่ใช่แค่ตอนอ่าน
 *
 * ระหว่างอ่านกับเขียน ครีเอเตอร์กด "ยกเลิกการยืนยัน" ได้ (ยอดลดลง) หรือลูกค้าแจ้งโอนเพิ่ม
 * — `moneyGateSql("delivered")` คือเงื่อนไขจ่ายครบตัวเดียวกับด่านส่งมอบ
 * และคำเตือนต้องเป็นใบเดียวกับที่อ่านมา (`auto_complete_warned_at` ไม่ขยับ)
 */
function completeGuards(c: Candidate): SQL {
  return sql`${moneyGateSql("delivered")}
    and not exists (
      select 1 from payment_record r
      where r.order_id = ${schema.order.id} and r.verified_at is null and r.rejected_at is null
    )
    and ${schema.order.autoCompleteWarnedAt} = ${c.warned_raw}::timestamptz`;
}

/**
 * เตือนลูกค้าว่าจะปิดงานอัตโนมัติ — จดเวลาเตือน + event ในคำสั่งเดียว แล้วค่อยแจ้งเตือน
 *
 * ⚠️ ไม่แตะ `updated_at` — มันคือจุดเริ่มนับของการปิดอัตโนมัติ ถ้าขยับ นาฬิกาจะเริ่มใหม่ทุกครั้งที่เตือน
 * และงานจะไม่มีวันถูกปิดเลย
 * แจ้งเตือนเฉพาะเมื่อเขียนสำเร็จ — cron ซ้ำสองรอบพร้อมกันได้ผู้ชนะคนเดียว ลูกค้าได้อีเมลฉบับเดียว
 */
async function warnAutoComplete(c: Candidate, now: Date): Promise<boolean> {
  const db = getDb();
  const o = schema.order;
  const at = now.toISOString();
  const days = AUTO_COMPLETE_NOTICE_DAYS;
  const [, warned] = await db.batch([
    lockOrder(c.id),
    db.execute(sql`
      with moved as (
        update "order"
        set auto_complete_warned_at = ${at}::timestamptz
        where ${o.id} = ${c.id} and ${o.status} = 'delivered'
          and ${unchangedSql(c)}
          and ${o.autoCompleteWarnedAt} is not distinct from ${c.warned_raw}::timestamptz
          and ${moneyGateSql("delivered")}
        returning "order".id
      )
      ${eventFromCte("auto_complete_warned", { actor: "system", days }, at)}
    `),
  ]);
  if (rowCount(warned) === 0) return false;

  await notify({
    userId: c.client_user_id,
    type: "order_auto_complete_soon",
    data: { code: c.code, days },
    url: `/my/requests/${c.code}`,
    entityType: "order",
    entityId: c.id,
  });
  return true;
}

/* ── ตัวเรียกหลัก ─────────────────────────────────────────────── */

export async function runLifecycle(
  opts: {
    dryRun?: boolean;
    now?: Date;
    limit?: number;
    /**
     * จำกัดให้ดูเฉพาะออเดอร์เหล่านี้ — สำหรับตรวจบนเครื่องกับข้อมูลทดสอบ
     *
     * ⚠️ เครื่อง dev ต่อฐานข้อมูลตัวเดียวกับ production การรัน cron จริงบนเครื่องโดยไม่จำกัด
     * จะไปปิด/หมดอายุออเดอร์ของผู้ใช้จริงและส่งอีเมลหาเขา
     */
    codes?: readonly string[] | null;
  } = {},
): Promise<LifecycleReport> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? LIFECYCLE_LIMIT;
  const dryRun = opts.dryRun ?? false;
  const codes = opts.codes ?? null;

  const report: LifecycleReport = {
    scanned: 0,
    expiredRequests: [],
    expiredQuotes: [],
    warned: [],
    completed: [],
    skippedChanged: [],
    errors: [],
  };

  for (const status of ["requested", "quoted", "delivered"] as const) {
    let rows: Candidate[];
    try {
      rows = await loadCandidates(status, now, limit, codes);
    } catch (err) {
      // กติกาหนึ่งพังต้องไม่ลากกติกาอื่นพังตาม — แต่ต้องขึ้นใน report ให้เห็น
      report.errors.push(`load ${status}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    report.scanned += rows.length;

    for (const c of rows) {
      const decision = decideLifecycle(toLifecycle(c), now);
      if (decision.kind === "none") continue;

      const bucket =
        decision.kind === "expire"
          ? decision.from === "requested"
            ? report.expiredRequests
            : report.expiredQuotes
          : decision.kind === "warn_auto_complete"
            ? report.warned
            : report.completed;

      if (dryRun) {
        bucket.push(c.code);
        continue;
      }

      try {
        const ok =
          decision.kind === "expire"
            ? await moveBySystem(c, decision.from, "expired", now, undefined)
            : decision.kind === "warn_auto_complete"
              ? await warnAutoComplete(c, now)
              : await moveBySystem(c, "delivered", "completed", now, completeGuards(c));
        (ok ? bucket : report.skippedChanged).push(c.code);
      } catch (err) {
        report.errors.push(`${c.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return report;
}
