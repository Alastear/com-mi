"use server";

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { isOrderCode } from "@/lib/orders/code";
import { notify } from "@/lib/notifications/create";

/**
 * บันทึกการชำระเงิน — แพลตฟอร์มไม่ได้ประมวลผลเงิน แค่จดว่ามีการจ่าย
 *
 * สองขั้นตอนแยกกันโดยตั้งใจ:
 *   1. ลูกค้า "แจ้งว่าโอนแล้ว"  → สร้าง payment_record ที่ยัง verifiedAt = null
 *   2. ครีเอเตอร์ "ยืนยันว่าเงินเข้า" → ตั้ง verifiedAt แล้วจึงนับเข้า amountPaidCents
 *
 * ⚠️ ขั้นที่ 2 คือด่านเดียวที่กันไฟล์งานหลุดก่อนได้เงิน และมันตั้งอยู่บน
 * "คนมองแล้วกดยืนยัน" ล้วน ๆ สลิปปลอมในไทยปี 2026 ทำได้แนบเนียนมาก
 * ข้อความบนปุ่มจึงต้องถามว่า "เงินเข้าบัญชีจริงหรือยัง" ไม่ใช่ "สลิปถูกไหม"
 * (docs/00 §5.2.1 — ทางแก้ระยะยาวคือต่อ API ตรวจสลิปเป็นฟีเจอร์ Pro)
 */

const METHODS = ["promptpay", "bank_transfer", "paypal", "stripe_link", "kofi", "other"] as const;

const RecordSchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  amountCents: z.number().int().positive().max(100_000_000),
  method: z.enum(METHODS),
  proofMediaId: z.string().max(60).nullable(),
  note: z.string().trim().max(500),
});

export type PaymentResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "not_found" | "invalid" | "forbidden" };

/** ผู้เกี่ยวข้องกับออเดอร์ใบนี้ — ใช้ซ้ำทั้งสอง action */
async function resolveOrder(code: string, userId: string) {
  const order = await getDb().query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, code: true, clientUserId: true, totalCents: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order) return null;

  const isCreator = order.page.userId === userId;
  const isClient = order.clientUserId === userId;
  if (!isCreator && !isClient) return null;

  return { ...order, isCreator, isClient };
}

/**
 * ลูกค้าแจ้งว่าโอนแล้ว — ยังไม่นับเป็นเงินที่ได้รับ
 *
 * ครีเอเตอร์ก็บันทึกแทนได้ (ลูกค้าโอนมาแล้วบอกทางไลน์) และในกรณีนั้น
 * ถือว่ายืนยันไปในตัว เพราะคนที่เห็นยอดในบัญชีคือคนกดเอง
 */
export async function recordPayment(input: z.input<typeof RecordSchema>): Promise<PaymentResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = RecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  const order = await resolveOrder(v.code, session.user.id);
  if (!order) return { ok: false, error: "not_found" };

  const now = new Date();
  await getDb().insert(schema.paymentRecord).values({
    id: newId("pay"),
    orderId: order.id,
    method: v.method,
    amountCents: v.amountCents,
    paidAt: now,
    proofMediaId: v.proofMediaId,
    note: v.note,
    ...(order.isCreator ? { verifiedByUserId: session.user.id, verifiedAt: now } : null),
  });

  if (order.isCreator) await recomputePaid(order.id);

  /**
   * แจ้ง **อีกฝ่าย** เสมอ ไม่ใช่ผู้รับตายตัว
   *
   * เดิมส่งไปที่ครีเอเตอร์ทั้งสองทาง — พอครีเอเตอร์เป็นคนบันทึกเอง
   * `notify()` ตัดทิ้งเพราะผู้ส่งกับผู้รับเป็นคนเดียวกัน **ลูกค้าจึงไม่มีทางรู้เลย
   * ว่ามีคนบันทึกยอดในนามของตัวเอง** ซึ่งเป็นรายการที่ปลดล็อกไฟล์งานได้
   * ต้องเห็นทั้งสองฝั่งเสมอ ไม่งั้นการบันทึกฝ่ายเดียวจะกลายเป็นเรื่องเงียบ
   */
  await notify({
    userId: order.isCreator ? order.clientUserId : order.page.userId,
    actorUserId: session.user.id,
    type: order.isCreator ? "payment_recorded_by_creator" : "payment_reported",
    data: { code: v.code, amount: v.amountCents },
    url: order.isCreator ? `/my/requests/${v.code}` : `/orders/${v.code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidatePath(`/orders/${v.code}`);
  revalidatePath(`/my/requests/${v.code}`);
  return { ok: true };
}

/** ครีเอเตอร์ยืนยันว่าเงินเข้าบัญชีจริง */
export async function confirmPayment(code: string, paymentId: string): Promise<PaymentResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!isOrderCode(code)) return { ok: false, error: "invalid" };

  const order = await resolveOrder(code, session.user.id);
  if (!order) return { ok: false, error: "not_found" };
  // ลูกค้ายืนยันเงินเข้าบัญชีคนอื่นไม่ได้ — คนเดียวที่เห็นยอดจริงคือเจ้าของบัญชี
  if (!order.isCreator) return { ok: false, error: "forbidden" };

  const db = getDb();
  const updated = await db
    .update(schema.paymentRecord)
    .set({ verifiedByUserId: session.user.id, verifiedAt: new Date() })
    .where(
      and(
        eq(schema.paymentRecord.id, paymentId),
        // ผูกกับออเดอร์ด้วย ไม่งั้นรู้ id แล้วยืนยันของออเดอร์อื่นได้
        eq(schema.paymentRecord.orderId, order.id),
      ),
    )
    .returning({ id: schema.paymentRecord.id });
  if (updated.length === 0) return { ok: false, error: "not_found" };

  await recomputePaid(order.id);

  // ยืนยันแล้ว → ลูกค้าต้องรู้ว่าเงินถึงแล้ว ไม่ต้องมาถามซ้ำว่าได้รับหรือยัง
  await notify({
    userId: order.clientUserId,
    actorUserId: session.user.id,
    type: "payment_confirmed",
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

/**
 * คำนวณ `amountPaidCents` ใหม่จากรายการที่ยืนยันแล้วทั้งหมด
 *
 * บวกเพิ่มทีละครั้งไม่ได้ — ถ้ายกเลิกการยืนยัน แก้ยอด หรือกดซ้ำ ตัวเลขจะเพี้ยน
 * แล้วเพี้ยนแบบเงียบ ๆ ด้วย ซึ่งแปลว่าไฟล์งานอาจถูกปลดล็อกทั้งที่เงินยังไม่ครบ
 * คิดใหม่จากแหล่งความจริงทุกครั้งช้ากว่านิดเดียวและถูกต้องเสมอ
 */
async function recomputePaid(orderId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.order)
    .set({
      amountPaidCents: sql`coalesce((
        select sum(${schema.paymentRecord.amountCents})
        from ${schema.paymentRecord}
        where ${schema.paymentRecord.orderId} = ${orderId}
          and ${schema.paymentRecord.verifiedAt} is not null
      ), 0)`,
      updatedAt: new Date(),
    })
    .where(eq(schema.order.id, orderId));
}

/** ยอดที่ยืนยันแล้วของออเดอร์ — ใช้ตรวจในเทสต์และเวลาไล่ปัญหา */
export async function verifiedTotal(orderId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`coalesce(sum(${schema.paymentRecord.amountCents}), 0)::int` })
    .from(schema.paymentRecord)
    .where(
      and(
        eq(schema.paymentRecord.orderId, orderId),
        isNotNull(schema.paymentRecord.verifiedAt),
      ),
    );
  return rows[0]?.n ?? 0;
}
