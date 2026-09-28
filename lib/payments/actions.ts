"use server";

import { and, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { canPay, PAYABLE_STATUSES } from "@/lib/orders/release";
import type { OrderStatus } from "@/lib/types";
import { isOrderCode } from "@/lib/orders/code";
// ทุก batch ที่แตะเงินของออเดอร์ต้องเริ่มด้วยตัวนี้ — ตัวเดียวกับที่ `transitionOrder` ใช้
import { lockOrder } from "@/lib/orders/lock";
import { notify } from "@/lib/notifications/create";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { checkReportAmount, fitsUnderTotal, isWholeBaht, paymentState, verifiedSum } from "./money";

/**
 * บันทึกการชำระเงิน — แพลตฟอร์มไม่ได้ประมวลผลเงิน แค่จดว่ามีการจ่าย
 *
 * สองขั้นตอนแยกกันโดยตั้งใจ:
 *   1. ลูกค้า "แจ้งว่าโอนแล้ว"  → สร้าง payment_record ที่ยัง verifiedAt = null
 *   2. ครีเอเตอร์ "ยืนยันว่าเงินเข้า" → ตั้ง verifiedAt แล้วจึงนับเข้า amountPaidCents
 *   และครีเอเตอร์ตอบกลับได้อีกสองทาง: "ยังไม่ได้รับเงิน" (reject) กับ "ยกเลิกการยืนยัน" (void)
 *
 * ⚠️ ขั้นที่ 2 คือด่านเดียวที่กันไฟล์งานหลุดก่อนได้เงิน และมันตั้งอยู่บน
 * "คนมองแล้วกดยืนยัน" ล้วน ๆ สลิปปลอมในไทยปี 2026 ทำได้แนบเนียนมาก
 * ข้อความบนปุ่มจึงต้องถามว่า "เงินเข้าบัญชีจริงหรือยัง" ไม่ใช่ "สลิปถูกไหม"
 * (docs/00 §5.2.1 — ทางแก้ระยะยาวคือต่อ API ตรวจสลิปเป็นฟีเจอร์ Pro)
 *
 * ⚠️ ช่องโหว่เดิมที่ไฟล์นี้ปิด: ลูกค้ากดแจ้งโอนยอดเดิมซ้ำได้เรื่อย ๆ แล้วครีเอเตอร์
 * ยืนยันทั้งสองแถว → ออเดอร์ขึ้นว่าจ่ายครบ ไฟล์ปลดล็อก ทั้งที่เงินเข้าจริงครึ่งเดียว
 * กันไว้สามชั้น ทุกชั้นอยู่ใน SQL ไม่ใช่ UI:
 *   - มีรายการรอยืนยันอยู่ ใครก็เพิ่มแถวเงินไม่ได้ — ทั้งลูกค้าแจ้งซ้ำ และครีเอเตอร์บันทึกเอง
 *   - ยอดที่แจ้งต้องไม่เกินยอดคงค้าง
 *   - ยืนยันแล้วยอดรวมห้ามเกินราคางาน
 *
 * **ทุกการเขียนเงินอยู่ใน `db.batch()` เดียว** (neon-http ไม่มี interactive transaction)
 * ลำดับในทุก batch เหมือนกัน: ล็อกแถวออเดอร์ → เขียนแบบ compare-and-set →
 * บันทึก event ถ้าเขียนสำเร็จ → คิด amountPaidCents ใหม่จากแถวจริง
 * (→ event "มัดจำครบ" ถ้าการคิดยอดเพิ่งเลื่อนกำหนดส่ง — เฉพาะทางที่ยอดเพิ่มได้)
 * ล็อกแถวออเดอร์ก่อนทำให้สอง request ของออเดอร์เดียวกันต่อคิวกัน คำสั่งถัดไปของ
 * อันที่มาทีหลังจึงเห็นผลของอันแรกแล้ว (READ COMMITTED ถ่าย snapshot ใหม่ทุกคำสั่ง)
 * ไม่งั้นสองคนกดพร้อมกันจะผ่านเงื่อนไข "ยังไม่เกินยอด" ทั้งคู่
 */

const METHODS = ["promptpay", "bank_transfer", "paypal", "stripe_link", "kofi", "other"] as const;

/** รูปแบบของ `newId("pay")` — ฝั่ง client สร้าง id ไว้ล่วงหน้าเพื่อกันกดซ้ำ */
const PAYMENT_ID = /^pay_[0-9A-HJKMNP-TV-Z]{22}$/;

const RecordSchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  // บาทเต็มเท่านั้น เหมือนช่องกรอก — เศษสตางค์ทิ้งยอดค้างที่ไม่มีฟอร์มไหนจ่ายได้ (ดู `isWholeBaht`)
  amountCents: z.number().int().positive().max(100_000_000).refine(isWholeBaht, "whole_baht"),
  method: z.enum(METHODS),
  proofMediaId: z.string().max(60).nullable(),
  note: z.string().trim().max(500),
  /**
   * id ของแถวที่จะสร้าง — ส่งมาจากฟอร์ม ใช้เป็น idempotency key
   *
   * ส่งซ้ำด้วย id เดิม (ดับเบิลคลิก เน็ตหลุดแล้วกดใหม่) = ได้แถวเดียว
   * ปลอดภัยที่จะรับจาก client เพราะใช้คู่กับ `on conflict (id) do nothing` เท่านั้น
   * เดา id ของคนอื่นได้ก็แค่ทำให้ของตัวเองบันทึกไม่ผ่าน
   */
  paymentId: z.string().regex(PAYMENT_ID).optional(),
});

const RespondSchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  paymentId: z.string().min(1).max(60),
  reason: z.string().trim().max(300),
});

export type PaymentResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "not_found"
        | "invalid"
        | "forbidden"
        | "order_closed"
        | "rate_limited"
        /** มีรายการที่ลูกค้าแจ้งไว้แล้วยังรอครีเอเตอร์ตอบ */
        | "pending_exists"
        /** ยอดที่แจ้ง/บันทึกเกินยอดคงค้าง */
        | "over_outstanding"
        /** ยืนยันแล้วยอดรวมจะเกินราคางาน */
        | "over_total"
        /** แถวนี้เปลี่ยนสถานะไปแล้วระหว่างที่หน้าจอยังเปิดค้าง */
        | "stale";
    };

/** ผู้เกี่ยวข้องกับออเดอร์ใบนี้ — ใช้ซ้ำทุก action */
async function resolveOrder(code: string, userId: string) {
  const order = await getDb().query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, code: true, clientUserId: true, totalCents: true, status: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order) return null;

  const isCreator = order.page.userId === userId;
  const isClient = order.clientUserId === userId;
  if (!isCreator && !isClient) return null;

  return { ...order, isCreator, isClient };
}

/** ทุกแถวของออเดอร์พร้อมสถานะ — ใช้ตอบ error ให้ตรงเรื่องก่อนเขียน (ด่านจริงอยู่ใน SQL) */
async function loadPayments(orderId: string) {
  const rows = await getDb()
    .select({
      id: schema.paymentRecord.id,
      amountCents: schema.paymentRecord.amountCents,
      verifiedAt: schema.paymentRecord.verifiedAt,
      rejectedAt: schema.paymentRecord.rejectedAt,
      voidedAt: schema.paymentRecord.voidedAt,
    })
    .from(schema.paymentRecord)
    .where(eq(schema.paymentRecord.orderId, orderId));
  return rows.map((r) => ({ ...r, state: paymentState(r) }));
}

/* ── ชิ้นส่วน SQL ที่ทุก batch ใช้ร่วมกัน ─────────────────────────────── */

/**
 * ยอดที่ยืนยันแล้วของออเดอร์ — นิยามเดียวของ "เงินที่นับ"
 *
 * ⚠️ ต้องตรงกับ `paymentState() === "verified"` ใน money.ts ทุกเงื่อนไข
 * แถวที่ void แล้วยังมี verified_at อยู่ ลืม `voided_at is null` เมื่อไหร่ = นับเงินที่ถูกยกเลิก
 * ใช้ alias `p` เสมอ จะได้ไม่ชนกับตาราง payment_record ของคำสั่ง UPDATE ชั้นนอก
 */
function verifiedSumSql(orderId: string): SQL {
  return sql`select coalesce(sum(p.amount_cents), 0)
    from payment_record p
    where p.order_id = ${orderId}
      and p.verified_at is not null
      and p.voided_at is null
      and p.rejected_at is null`;
}

/**
 * ออเดอร์ยังรับเรื่องเงินอยู่ไหม — `canPay()` ในรูป SQL ใส่ใน WHERE ของทุกการเขียนเงิน
 *
 * ⚠️ เช็คสถานะใน JS ก่อนเขียนอย่างเดียวไม่พอ: ระหว่างอ่านกับเขียน อีกฝ่ายกดยกเลิกได้
 * แล้วรายการแจ้งโอน/การยืนยันจะไปตกบนออเดอร์ที่ยกเลิกแล้ว ซึ่งแผงเงินเป็นแบบอ่านอย่างเดียว
 * — แถวที่ลงไปตอนนั้นค้างอยู่ตลอดกาลโดยไม่มีปุ่มไหนตอบมันได้ และ Server Action ก็ยิงตรงได้
 * โดยไม่ผ่านหน้าจอเลย ยืนยัน/ปฏิเสธ/ยกเลิกการยืนยันบนออเดอร์ที่ปิดแล้วจึงต้องไม่ผ่านที่นี่
 *
 * ปลอดภัยต่อการแข่งเพราะทุก batch เริ่มด้วย `lockOrder()` — `transitionOrder` ที่จะเปลี่ยนสถานะ
 * ต้องรอ lock เดียวกัน คำสั่งนี้จึงเห็นสถานะล่าสุดที่ commit แล้ว และมันเปลี่ยนไม่ได้จนจบ batch
 *
 * รายการสถานะมาจาก `PAYABLE_STATUSES` ตัวเดียวกับ `canPay()` — ห้ามเขียนซ้ำตรงนี้
 */
function orderPayableSql(orderId: string): SQL {
  const statuses = sql.join(
    PAYABLE_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  return sql`exists (
    select 1 from "order" o where o.id = ${orderId} and o.status in (${statuses})
  )`;
}

/** อ่านสถานะล่าสุดหลังเขียนไม่ผ่าน — แยก "ออเดอร์ปิดไปแล้ว" ออกจาก error อื่น */
async function orderClosedNow(orderId: string): Promise<boolean> {
  const fresh = await getDb().query.order.findFirst({
    where: eq(schema.order.id, orderId),
    columns: { status: true },
  });
  return !fresh || !canPay(fresh.status as OrderStatus);
}

/**
 * คำนวณ `amountPaidCents` ใหม่จากแถวจริง — อยู่ใน batch เดียวกับการเขียนเสมอ
 *
 * บวกเพิ่มทีละครั้งไม่ได้ — ถ้ายกเลิกการยืนยัน ปฏิเสธ หรือกดซ้ำ ตัวเลขจะเพี้ยน
 * แล้วเพี้ยนแบบเงียบ ๆ ด้วย ซึ่งแปลว่าไฟล์งานอาจถูกปลดล็อกทั้งที่เงินยังไม่ครบ
 * อยู่ใน batch เดียวกันเพราะถ้าแยกคำสั่ง แล้วเซิร์ฟเวอร์ตายตรงกลาง ตัวเลขบนออเดอร์
 * กับแถวเงินจะไม่ตรงกันค้างไว้จนกว่าจะมีคนกดอะไรสักอย่างอีกครั้ง
 *
 * `is distinct from` ทำให้กดซ้ำแล้วไม่เขียนอะไรเลย (updatedAt ไม่ขยับเปล่า ๆ)
 *
 * **มัดจำเพิ่งครบในคำสั่งนี้ = เริ่มนับกำหนดส่งใหม่จากตอนนี้** (ครั้งเดียวต่อออเดอร์)
 * `dueAt` ตั้งไว้ตั้งแต่ลูกค้ากดสั่ง แต่ครีเอเตอร์ลงมือไม่ได้จนกว่ามัดจำจะเข้า (ด่าน `depositSatisfied`)
 * ถ้าไม่เลื่อน ลูกค้าที่โอนมัดจำช้าไปหนึ่งสัปดาห์จะทำให้งานขึ้น "เลยกำหนด" ทั้งที่ครีเอเตอร์เพิ่งได้เริ่ม
 * อยู่ใน UPDATE เดียวกับยอดเงิน — ใน SET ทุกคอลัมน์อ่านค่า **ก่อน** เขียน
 * `amount_paid_cents` ในเงื่อนไขจึงเป็นยอดเดิม ส่วน `paid` คือยอดใหม่ = ตรวจ "ข้ามเส้น" ได้ในคำสั่งเดียว
 * ⚠️ ต้องตรงกับ `depositJustMet()` / `dueAfterDeposit()` ใน lib/orders/lifecycle.ts ทุกเงื่อนไข
 */
function recomputePaid(orderId: string, now: Date) {
  const db = getDb();
  const o = schema.order;
  const paid = sql`(${verifiedSumSql(orderId)})`;
  const at = sql`${now.toISOString()}::timestamptz`;
  /**
   * ดูที่ "ข้ามเส้น" ไม่ใช่แค่ "ถึงแล้ว" — ออเดอร์ที่มัดจำครบไปก่อนมีคอลัมน์ `deposit_met_at`
   * (ค่าเป็น null) ต้องไม่ถูกเลื่อนกำหนดส่งตอนลูกค้าโอนงวดสุดท้าย
   * `deposit_met_at is null` คือด่าน "ครั้งเดียว": ยกเลิกการยืนยันแล้วยืนยันใหม่ไม่เลื่อนซ้ำ
   */
  const justMet = sql`(${o.depositMetAt} is null and ${o.depositCents} > 0
    and ${o.amountPaidCents} < ${o.depositCents} and ${paid} >= ${o.depositCents})`;
  return db
    .update(o)
    .set({
      amountPaidCents: paid,
      updatedAt: now,
      depositMetAt: sql`case when ${justMet} then ${at} else ${o.depositMetAt} end`,
      /**
       * ระยะเวลาทำงานเอาจากตัวออเดอร์ (`due_at - created_at`) ไม่ใช่ `service.delivery_days` ปัจจุบัน
       * — เหตุผลอยู่ที่ `dueAfterDeposit()` (ครีเอเตอร์แก้เมนูได้ตลอด ออเดอร์คือหลักฐาน)
       */
      dueAt: sql`case when ${justMet} and ${o.dueAt} is not null
        then ${at} + (${o.dueAt} - ${o.createdAt}) else ${o.dueAt} end`,
    })
    .where(and(eq(o.id, orderId), sql`${o.amountPaidCents} is distinct from ${paid}`));
}

/**
 * event "มัดจำครบ เริ่มนับวันส่งงาน" — เขียนเฉพาะเมื่อ `recomputePaid` ใน batch นี้เพิ่งตั้ง `deposit_met_at`
 *
 * ต้องวางหลัง `recomputePaid` ใน batch เสมอ (อ่านค่าที่มันเพิ่งเขียน) และเก็บกำหนดส่งใหม่ลงใน event
 * ด้วย — เธรดคือหลักฐานของทั้งสองฝ่ายว่านาฬิกาเริ่มเมื่อไร ถึงวันหนึ่ง `due_at` จะถูกแก้ต่อก็ตาม
 * ไม่มีคนกด (ระบบเลื่อนให้เอง) จึงไม่มี sender และ actor เป็น system
 */
function insertDepositMetEvent(orderId: string, now: Date) {
  const at = now.toISOString();
  return getDb().execute(sql`
    insert into message (id, order_id, sender_user_id, is_system_event, event_type, event_data, created_at)
    select ${newId("msg")}::text, o.id, null, true, 'deposit_met'::text,
           jsonb_build_object('actor', 'system', 'due', o.due_at), ${at}::timestamptz
    from "order" o
    where o.id = ${orderId} and o.deposit_met_at = ${at}::timestamptz
  `);
}

/**
 * บันทึก event ลง timeline **เฉพาะเมื่อการเขียนก่อนหน้าใน batch สำเร็จจริง**
 *
 * batch ไม่มี if — คำสั่งทุกตัวรันเสมอ ถ้า compare-and-set ไม่โดนแถวไหน (กดซ้ำ)
 * การ insert ธรรมดาจะทิ้ง event ซ้ำไว้ในเธรด `guard` จึงเช็คว่าแถวเงินมีค่าที่
 * batch นี้เพิ่งเขียนลงไปจริง (เวลา `now` ของ request นี้ ละเอียดถึงมิลลิวินาที)
 * ⚠️ สอง request ที่สร้าง `now` ในมิลลิวินาทีเดียวกันพอดีจะได้ event ซ้ำหนึ่งแถว — แค่ในเธรด
 * ตัวเงินไม่ซ้ำ เพราะ compare-and-set ให้ผ่านได้แค่อันเดียวอยู่แล้ว
 *
 * ทุกพารามิเตอร์มี cast — ใน `insert ... select` Postgres เดาชนิดของพารามิเตอร์
 * ใน select list ไม่ได้ และจะถือเป็น text จนชนกับคอลัมน์ jsonb/timestamptz
 */
function insertEventIf(input: {
  orderId: string;
  actorUserId: string;
  eventType: string;
  data: Record<string, string | number>;
  now: Date;
  guard: SQL;
}) {
  const db = getDb();
  return db.execute(sql`
    insert into message (id, order_id, sender_user_id, is_system_event, event_type, event_data, created_at)
    select ${newId("msg")}::text, ${input.orderId}::text, ${input.actorUserId}::text, true,
           ${input.eventType}::text, ${JSON.stringify(input.data)}::jsonb, ${input.now.toISOString()}::timestamptz
    where exists (${input.guard})
  `);
}

/** จำนวนแถวที่คำสั่ง raw ใน batch เขียนไป — ผลของ neon-http มีได้ทั้ง rows และ rowCount */
function affected(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const r = result as { rowCount?: number | null; rows?: unknown[] };
  return r.rowCount ?? r.rows?.length ?? 0;
}

function revalidateOrder(code: string) {
  revalidatePath(`/orders/${code}`);
  revalidatePath(`/my/requests/${code}`);
  revalidatePath("/orders");
}

/* ── แจ้งโอน / บันทึกรับเงิน ──────────────────────────────────────────── */

/**
 * ลูกค้าแจ้งว่าโอนแล้ว — ยังไม่นับเป็นเงินที่ได้รับ
 *
 * ครีเอเตอร์ก็บันทึกแทนได้ (ลูกค้าโอนมาแล้วบอกทางไลน์) และในกรณีนั้น
 * ถือว่ายืนยันไปในตัว เพราะคนที่เห็นยอดในบัญชีคือคนกดเอง
 * — แต่ไม่ใช่ระหว่างที่ลูกค้ามีรายการรอตอบอยู่ (เหตุผลอยู่ที่ด่าน `pending_exists` ข้างล่าง)
 */
export async function recordPayment(input: z.input<typeof RecordSchema>): Promise<PaymentResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = RecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  /**
   * จำกัดต่อผู้ใช้ ไม่ใช่ต่อออเดอร์ — ทุกครั้งที่ผ่านคือแถวเงิน + event ในเธรด + แจ้งเตือน
   * + อีเมลหาอีกฝ่าย ซึ่งไม่มีใครลบได้ ยิงรัว ๆ ข้ามหลายออเดอร์ก็ต้องโดนนับ
   */
  const gate = await rateLimit(
    `pay:${session.user.id}`,
    LIMITS.recordPayment.limit,
    LIMITS.recordPayment.windowSeconds,
  );
  if (!gate.ok) return { ok: false, error: "rate_limited" };

  const order = await resolveOrder(v.code, session.user.id);
  if (!order) return { ok: false, error: "not_found" };

  /**
   * รับเงินได้เฉพาะออเดอร์ที่ครีเอเตอร์ตอบรับแล้วและยังไม่ตาย
   *
   * ครอบสองเรื่องพร้อมกัน (ดู `canPay` ใน lib/orders/release.ts):
   *   ยังไม่ตอบรับ — ลูกค้าโอนก่อนที่ครีเอเตอร์จะได้ดูงานหรือปรับราคา
   *   ตายแล้ว      — ยกเลิก/ปฏิเสธ/หมดอายุ แล้วยังมีเงินขยับ
   *
   * ⚠️ ด่านนี้ต้องอยู่ที่นี่ ไม่ใช่แค่ซ่อนปุ่มในหน้าเว็บ — Server Action ยิงตรงได้
   */
  if (!canPay(order.status as OrderStatus)) {
    return { ok: false, error: "order_closed" };
  }

  const byCreator = order.isCreator;
  const rows = await loadPayments(order.id);

  // ส่งซ้ำด้วย id เดิม = แถวนี้บันทึกไปแล้ว ตอบสำเร็จโดยไม่ทำอะไรเพิ่ม
  if (v.paymentId && rows.some((r) => r.id === v.paymentId)) return { ok: true };

  /**
   * มีรายการที่ลูกค้าแจ้งไว้แล้วยังไม่ถูกตอบ = ห้ามเพิ่มแถวเงิน **ทั้งสองฝ่าย**
   *
   * ⚠️ เดิมครีเอเตอร์ข้ามด่านนี้ได้ ซึ่งเปิดช่องนับเงินซ้ำกลับมาเอง: ลูกค้าโอนมัดจำ ฿1,500
   * ของงาน ฿3,000 กด "แจ้งว่าโอนแล้ว" แล้วส่งสลิปทางไลน์ด้วย ครีเอเตอร์เห็นสลิปก่อน
   * เลยบันทึก ฿1,500 เอง (นับทันที) แล้วค่อยกดยืนยันรายการที่ลูกค้าแจ้ง →
   * 1,500 + 1,500 = 3,000 ไม่เกินราคางาน เพดานจึงจับไม่ได้ ออเดอร์ขึ้นว่าจ่ายครบ
   * ไฟล์ปลดล็อก ทั้งที่เงินเข้าจริงก้อนเดียว
   * ให้ครีเอเตอร์ตอบรายการนั้นก่อน (ยืนยัน หรือ ยังไม่ได้รับ) แล้วค่อยบันทึกเงินก้อนอื่น
   */
  if (rows.some((r) => r.state === "pending")) {
    return { ok: false, error: "pending_exists" };
  }
  const outstanding = Math.max(0, order.totalCents - verifiedSum(rows));
  const check = checkReportAmount(v.amountCents, outstanding);
  if (check !== "ok") return { ok: false, error: check };

  const db = getDb();
  const id = v.paymentId ?? newId("pay");
  const now = new Date();
  const at = now.toISOString();

  /**
   * insert แบบมีเงื่อนไข — เงื่อนไขชุดเดียวกับที่เช็คด้านบน แต่เช็คซ้ำใต้ lock
   * ด้านบนมีไว้ตอบ error ให้ตรงเรื่อง ตรงนี้คือด่านจริง
   *
   *   ต้องไม่มีแถวที่ยังไม่ถูกตอบ (ไม่ verified และไม่ rejected) — ทั้งสองฝ่าย
   *   ยอดต้องไม่เกินราคางาน − ที่ยืนยันแล้ว
   *   ออเดอร์ยังรับเงินอยู่ (`orderPayableSql`) — ไม่งั้นแจ้งโอนที่กดพร้อมกับอีกฝ่ายกดยกเลิก
   *   จะลงไปค้างบนออเดอร์ที่ยกเลิกแล้วโดยไม่มีใครตอบได้
   */
  const noPending = sql`not exists (
    select 1 from payment_record p
    where p.order_id = ${order.id} and p.verified_at is null and p.rejected_at is null
  )`;

  const [, inserted] = await db.batch([
    lockOrder(order.id),
    db.execute(sql`
      insert into payment_record
        (id, order_id, method, amount_cents, paid_at, proof_media_id, note,
         verified_by_user_id, verified_at, created_at)
      select ${id}::text, ${order.id}::text, ${v.method}::text, ${v.amountCents}::int,
             ${at}::timestamptz, ${v.proofMediaId}::text, ${v.note}::text,
             ${byCreator ? session.user.id : null}::text,
             ${byCreator ? at : null}::timestamptz, ${at}::timestamptz
      where ${v.amountCents}::int <= (select o.total_cents from "order" o where o.id = ${order.id})
                                     - (${verifiedSumSql(order.id)})
        and ${noPending}
        and ${orderPayableSql(order.id)}
      on conflict (id) do nothing
      returning id
    `),
    insertEventIf({
      orderId: order.id,
      actorUserId: session.user.id,
      eventType: byCreator ? "payment_recorded" : "payment_reported",
      data: { actor: byCreator ? "creator" : "client", amount: v.amountCents },
      now,
      guard: sql`select 1 from payment_record p where p.id = ${id} and p.created_at = ${at}::timestamptz`,
    }),
    recomputePaid(order.id, now),
    // ครีเอเตอร์บันทึกเอง = นับทันที ยอดอาจเพิ่งถึงมัดจำตรงนี้ (ลูกค้าแจ้งเฉย ๆ ยังไม่นับ guard จึงไม่ติด)
    insertDepositMetEvent(order.id, now),
  ]);

  if (affected(inserted) === 0) {
    // แพ้การแข่งกับอีก request — ดูของจริงอีกรอบแล้วตอบให้ตรงเรื่อง
    const fresh = await loadPayments(order.id);
    if (fresh.some((r) => r.id === id)) return { ok: true };
    if (await orderClosedNow(order.id)) return { ok: false, error: "order_closed" };
    if (fresh.some((r) => r.state === "pending")) {
      return { ok: false, error: "pending_exists" };
    }
    return { ok: false, error: "over_outstanding" };
  }

  /**
   * แจ้ง **อีกฝ่าย** เสมอ ไม่ใช่ผู้รับตายตัว
   *
   * เดิมส่งไปที่ครีเอเตอร์ทั้งสองทาง — พอครีเอเตอร์เป็นคนบันทึกเอง
   * `notify()` ตัดทิ้งเพราะผู้ส่งกับผู้รับเป็นคนเดียวกัน **ลูกค้าจึงไม่มีทางรู้เลย
   * ว่ามีคนบันทึกยอดในนามของตัวเอง** ซึ่งเป็นรายการที่ปลดล็อกไฟล์งานได้
   * ต้องเห็นทั้งสองฝั่งเสมอ ไม่งั้นการบันทึกฝ่ายเดียวจะกลายเป็นเรื่องเงียบ
   */
  await notify({
    userId: byCreator ? order.clientUserId : order.page.userId,
    actorUserId: session.user.id,
    type: byCreator ? "payment_recorded_by_creator" : "payment_reported",
    data: { code: v.code, amount: v.amountCents },
    url: byCreator ? `/my/requests/${v.code}` : `/orders/${v.code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidateOrder(v.code);
  return { ok: true };
}

/* ── ครีเอเตอร์ตอบรายการที่ลูกค้าแจ้ง ─────────────────────────────────── */

/**
 * ตรวจสิทธิ์ + หาแถว สำหรับสาม action ของครีเอเตอร์ — ยืนยัน / ยังไม่ได้รับ / ยกเลิกการยืนยัน
 *
 * ลูกค้าตอบรายการเงินของตัวเองไม่ได้ทั้งสามทาง — คนเดียวที่เห็นยอดจริงคือเจ้าของบัญชี
 */
async function resolveForCreator(code: string, paymentId: string, userId: string) {
  const order = await resolveOrder(code, userId);
  if (!order) return { ok: false as const, error: "not_found" as const };
  if (!order.isCreator) return { ok: false as const, error: "forbidden" as const };
  /**
   * ออเดอร์ที่ยกเลิก/ปฏิเสธ/หมดอายุแล้ว ตอบรายการเงินไม่ได้ทั้งสามทาง — ตรงกับแผงเงินที่เป็นแบบอ่านอย่างเดียว
   * ตรงนี้แค่ตอบให้ตรงเรื่อง ด่านจริงคือ `orderPayableSql` ใน WHERE ของแต่ละ action
   * (`completed` ยังผ่าน — สลิปปลอมที่เพิ่งพบหลังปิดงานต้องยกเลิกการยืนยันได้ ดู `paymentMode`)
   */
  if (!canPay(order.status as OrderStatus)) {
    return { ok: false as const, error: "order_closed" as const };
  }

  const rows = await loadPayments(order.id);
  // ผูกกับออเดอร์ด้วยเสมอ ไม่งั้นรู้ id แล้วไปตอบแถวของออเดอร์อื่นได้
  const row = rows.find((r) => r.id === paymentId);
  if (!row) return { ok: false as const, error: "not_found" as const };

  return { ok: true as const, order, rows, row };
}

/** ครีเอเตอร์ยืนยันว่าเงินเข้าบัญชีจริง */
export async function confirmPayment(code: string, paymentId: string): Promise<PaymentResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!isOrderCode(code) || typeof paymentId !== "string" || paymentId.length > 60) {
    return { ok: false, error: "invalid" };
  }

  const found = await resolveForCreator(code, paymentId, session.user.id);
  if (!found.ok) return found;
  const { order, rows, row } = found;

  // กดซ้ำหลังสำเร็จไปแล้ว — ไม่ใช่ error และห้ามแจ้งเตือนซ้ำ
  if (row.state === "verified") return { ok: true };
  if (row.state !== "pending") return { ok: false, error: "stale" };
  if (!fitsUnderTotal(row.amountCents, verifiedSum(rows), order.totalCents)) {
    return { ok: false, error: "over_total" };
  }

  const db = getDb();
  const now = new Date();
  const at = now.toISOString();

  const [, updated] = await db.batch([
    lockOrder(order.id),
    /**
     * compare-and-set: ยังไม่ถูกตอบ + ยืนยันแล้วยอดรวมไม่เกินราคางาน
     *
     * เพดานต้องอยู่ใน WHERE ตรงนี้ ไม่ใช่แค่เช็คด้านบน — สองแท็บยืนยันสองแถวพร้อมกัน
     * ต่างคนต่างเห็นยอดเดิมและผ่านทั้งคู่ได้ ใต้ lock คำสั่งนี้เห็นยอดล่าสุดเสมอ
     */
    db
      .update(schema.paymentRecord)
      .set({ verifiedByUserId: session.user.id, verifiedAt: now })
      .where(
        and(
          eq(schema.paymentRecord.id, row.id),
          eq(schema.paymentRecord.orderId, order.id),
          isNull(schema.paymentRecord.verifiedAt),
          isNull(schema.paymentRecord.rejectedAt),
          isNull(schema.paymentRecord.voidedAt),
          sql`${schema.paymentRecord.amountCents} + (${verifiedSumSql(order.id)})
              <= (select o.total_cents from "order" o where o.id = ${order.id})`,
          orderPayableSql(order.id),
        ),
      )
      .returning({ id: schema.paymentRecord.id }),
    insertEventIf({
      orderId: order.id,
      actorUserId: session.user.id,
      eventType: "payment_confirmed",
      data: { actor: "creator", amount: row.amountCents },
      now,
      guard: sql`select 1 from payment_record p where p.id = ${row.id} and p.verified_at = ${at}::timestamptz`,
    }),
    recomputePaid(order.id, now),
    /**
     * ยืนยันแล้วยอดอาจเพิ่งถึงมัดจำ — ปฏิเสธ/ยกเลิกการยืนยันไม่ต้องมี เพราะยอดไม่มีทางเพิ่มขึ้นได้
     * (`recomputePaid` เลื่อนกำหนดส่งเฉพาะตอนยอดข้ามเส้นขึ้นไป)
     */
    insertDepositMetEvent(order.id, now),
  ]);

  if (updated.length === 0) {
    const fresh = (await loadPayments(order.id)).find((r) => r.id === row.id);
    if (fresh?.state === "verified") return { ok: true };
    if (await orderClosedNow(order.id)) return { ok: false, error: "order_closed" };
    // ยังรออยู่แต่เขียนไม่ผ่าน และออเดอร์ยังเปิด = เงื่อนไขที่เหลือข้อเดียวคือเพดาน
    return { ok: false, error: fresh?.state === "pending" ? "over_total" : "stale" };
  }

  // ยืนยันแล้ว → ลูกค้าต้องรู้ว่าเงินถึงแล้ว ไม่ต้องมาถามซ้ำว่าได้รับหรือยัง
  await notify({
    userId: order.clientUserId,
    actorUserId: session.user.id,
    type: "payment_confirmed",
    // ยอดของแถวที่เพิ่งยืนยัน — อีเมลบอกลูกค้าว่า "ได้รับเท่าไร" ไม่ใช่แค่ "ได้รับแล้ว"
    data: { code, amount: row.amountCents },
    url: `/my/requests/${code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidateOrder(code);
  return { ok: true };
}

/**
 * ครีเอเตอร์ตอบว่า "ยังไม่ได้รับเงิน"
 *
 * แถวไม่ถูกลบ — ทั้งสองฝ่ายเห็นว่าเคยแจ้งยอดนี้และได้คำตอบว่าอะไร
 * ลูกค้าแจ้งใหม่ได้ทันที เพราะแถวที่ถูกปฏิเสธไม่นับเป็น "รอยืนยัน" อีกต่อไป
 */
export async function rejectPayment(
  input: z.input<typeof RespondSchema>,
): Promise<PaymentResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = RespondSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, paymentId, reason } = parsed.data;

  const found = await resolveForCreator(code, paymentId, session.user.id);
  if (!found.ok) return found;
  const { order, row } = found;

  if (row.state === "rejected") return { ok: true };
  // ยืนยันไปแล้วต้องใช้ "ยกเลิกการยืนยัน" ซึ่งทิ้งร่องรอยว่าเคยนับเงินก้อนนี้
  if (row.state !== "pending") return { ok: false, error: "stale" };

  const db = getDb();
  const now = new Date();
  const at = now.toISOString();

  const [, updated] = await db.batch([
    lockOrder(order.id),
    db
      .update(schema.paymentRecord)
      .set({ rejectedAt: now, rejectedByUserId: session.user.id, rejectReason: reason })
      .where(
        and(
          eq(schema.paymentRecord.id, row.id),
          eq(schema.paymentRecord.orderId, order.id),
          isNull(schema.paymentRecord.verifiedAt),
          isNull(schema.paymentRecord.rejectedAt),
          orderPayableSql(order.id),
        ),
      )
      .returning({ id: schema.paymentRecord.id }),
    insertEventIf({
      orderId: order.id,
      actorUserId: session.user.id,
      eventType: "payment_rejected",
      data: { actor: "creator", amount: row.amountCents },
      now,
      guard: sql`select 1 from payment_record p where p.id = ${row.id} and p.rejected_at = ${at}::timestamptz`,
    }),
    // แถวที่รออยู่ไม่เคยถูกนับ ยอดจึงไม่ควรเปลี่ยน — คิดใหม่ไว้ก่อน ถ้าเคยเพี้ยนจะได้กลับมาตรง
    recomputePaid(order.id, now),
  ]);

  if (updated.length === 0) {
    const fresh = (await loadPayments(order.id)).find((r) => r.id === row.id);
    if (fresh?.state === "rejected") return { ok: true };
    return { ok: false, error: (await orderClosedNow(order.id)) ? "order_closed" : "stale" };
  }

  await notify({
    userId: order.clientUserId,
    actorUserId: session.user.id,
    type: "payment_rejected",
    data: { code, amount: row.amountCents },
    url: `/my/requests/${code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidateOrder(code);
  return { ok: true };
}

/**
 * ครีเอเตอร์ยกเลิกการยืนยันที่กดไปแล้ว (กดผิดแถว ยอดถูกดึงกลับ ฯลฯ)
 *
 * ต้องมีเหตุผลเสมอ — การกระทำนี้ลบเงินที่ลูกค้าเชื่อว่าจ่ายไปแล้วออกจากยอด
 * และอาจล็อกไฟล์ที่ลูกค้าเคยโหลดได้กลับคืน ลูกค้าต้องรู้ว่าเพราะอะไร
 *
 * ไฟล์ล็อกกลับเองโดยไม่ต้องทำอะไรเพิ่ม: URL ดาวน์โหลดเรียก `canRelease()`
 * ใหม่ทุกครั้งที่ออก (lib/delivery/actions.ts) และมันอ่าน amountPaidCents
 * ที่ batch นี้เพิ่งคิดใหม่ — URL ที่ออกไปแล้วก่อนหน้านี้หมดอายุเองตามเวลาของมัน
 */
export async function voidPayment(input: z.input<typeof RespondSchema>): Promise<PaymentResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = RespondSchema.safeParse(input);
  if (!parsed.success || parsed.data.reason.length === 0) return { ok: false, error: "invalid" };
  const { code, paymentId, reason } = parsed.data;

  const found = await resolveForCreator(code, paymentId, session.user.id);
  if (!found.ok) return found;
  const { order, row } = found;

  if (row.state === "voided") return { ok: true };
  if (row.state !== "verified") return { ok: false, error: "stale" };

  const db = getDb();
  const now = new Date();
  const at = now.toISOString();

  const [, updated] = await db.batch([
    lockOrder(order.id),
    db
      .update(schema.paymentRecord)
      .set({ voidedAt: now, voidedByUserId: session.user.id, voidReason: reason })
      .where(
        and(
          eq(schema.paymentRecord.id, row.id),
          eq(schema.paymentRecord.orderId, order.id),
          isNotNull(schema.paymentRecord.verifiedAt),
          isNull(schema.paymentRecord.voidedAt),
          isNull(schema.paymentRecord.rejectedAt),
          orderPayableSql(order.id),
        ),
      )
      .returning({ id: schema.paymentRecord.id }),
    insertEventIf({
      orderId: order.id,
      actorUserId: session.user.id,
      eventType: "payment_voided",
      data: { actor: "creator", amount: row.amountCents },
      now,
      guard: sql`select 1 from payment_record p where p.id = ${row.id} and p.voided_at = ${at}::timestamptz`,
    }),
    recomputePaid(order.id, now),
  ]);

  if (updated.length === 0) {
    const fresh = (await loadPayments(order.id)).find((r) => r.id === row.id);
    if (fresh?.state === "voided") return { ok: true };
    return { ok: false, error: (await orderClosedNow(order.id)) ? "order_closed" : "stale" };
  }

  await notify({
    userId: order.clientUserId,
    actorUserId: session.user.id,
    type: "payment_voided",
    data: { code, amount: row.amountCents },
    url: `/my/requests/${code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidateOrder(code);
  return { ok: true };
}
