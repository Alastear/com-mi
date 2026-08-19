"use server";

import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth-guard";
import { ACTIVE_STATUSES } from "@/lib/types";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { quoteOrder } from "./pricing";
import { assertCanAcceptNewOrder, insertNewOrder } from "./new-order";
import { notify } from "@/lib/notifications/create";

/**
 * สร้างออเดอร์จากฟอร์มบรีฟ
 *
 * ทุกอย่างที่ client ส่งมาถือว่าไม่น่าเชื่อถือ — รับแค่ **id ของสิ่งที่เลือก**
 * ไม่รับราคา ไม่รับยอดรวม ไม่รับชื่อเมนู ราคาคำนวณใหม่จากเมนูใน DB เสมอ
 * (ถ้ารับยอดรวมจาก client ใครก็สั่งงานราคา 0 บาทได้)
 */

const BriefAnswerSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  value: z.string().max(4000),
});

const CreateOrderSchema = z.object({
  handle: z.string().min(1).max(40),
  slug: z.string().min(1).max(120),
  tierId: z.string().max(60).nullable(),
  options: z
    .array(z.object({ optionId: z.string().max(60), quantity: z.number().int().min(0).max(99) }))
    .max(30),
  answers: z.array(BriefAnswerSchema).max(20),
  acceptTos: z.literal(true),
  isPublicInQueue: z.boolean(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export type CreateOrderResult =
  | { ok: true; code: string }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "not_found"
        | "shop_closed"
        | "own_shop"
        | "creator_full"
        | "rate_limited";
      retryAfterSeconds?: number;
    };

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const session = await getSession();
  // ไม่ redirect เพราะฟอร์มกรอกไว้แล้ว — ให้ client เก็บร่างก่อนแล้วค่อยพาไปล็อกอิน
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = CreateOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  const gate = await rateLimit(
    `order:${session.user.id}`,
    LIMITS.createOrder.limit,
    LIMITS.createOrder.windowSeconds,
  );
  if (!gate.ok) {
    return { ok: false, error: "rate_limited", retryAfterSeconds: gate.retryAfterSeconds };
  }

  const db = getDb();

  const owner = await db.query.user.findFirst({
    columns: { id: true, plan: true },
    where: eq(schema.user.handle, v.handle.toLowerCase()),
  });
  if (!owner) return { ok: false, error: "not_found" };

  const page = await db.query.creatorPage.findFirst({
    where: eq(schema.creatorPage.userId, owner.id),
    with: {
      services: {
        where: and(eq(schema.service.isActive, true), isNull(schema.service.deletedAt)),
        with: { tiers: true, options: true },
      },
    },
  });
  if (!page) return { ok: false, error: "not_found" };

  /**
   * ด่านทั้งหมดอยู่ในโมดูลเดียว — ห้ามเขียนซ้ำที่นี่
   * ทางสร้างออเดอร์ทางอื่นที่จะมีทีหลัง (ใบเชิญลูกค้า) ต้องเรียกตัวเดียวกันนี้
   */
  const gateResult = assertCanAcceptNewOrder({
    page,
    owner,
    clientUserId: session.user.id,
  });
  if (!gateResult.ok) return { ok: false, error: gateResult.error };

  const service = page.services.find((s) => s.slug === v.slug);
  if (!service) return { ok: false, error: "not_found" };

  // ── ราคา: คำนวณใหม่ทั้งหมดจากข้อมูลใน DB ──
  const quote = quoteOrder(
    {
      basePriceCents: service.basePriceCents,
      title: service.title,
      tiers: service.tiers,
      options: service.options,
    },
    { tierId: v.tierId, options: v.options },
  );

  /**
   * เมนูราคา ฿0 สั่งไม่ได้ — ทางที่ครีเอเตอร์ตั้งราคาเองกันข้อนี้ไว้แล้วทั้งสองทาง
   * (`quoteFromLines` → "empty") ทางเมนูเป็นทางเดียวที่ยังหลุด
   * ออเดอร์ ฿0 ที่ถูกตอบรับแล้วจะติดตายถาวร — ส่งมอบไม่ได้ ตั้งราคาใหม่ก็ไม่ได้
   */
  if (quote.totalCents <= 0) return { ok: false, error: "not_found" };

  const created = await insertNewOrder({
    page,
    owner,
    service,
    clientUserId: session.user.id,
    actorUserId: session.user.id,
    quote,
    answers: v.answers,
    isPublicInQueue: v.isPublicInQueue,
  });
  if (!created.ok) return { ok: false, error: created.error };

  // ออเดอร์ใหม่คือแจ้งเตือนที่สำคัญที่สุดสำหรับครีเอเตอร์ — คือรายได้ที่เพิ่งเข้ามา
  await notify({
    userId: owner.id,
    actorUserId: session.user.id,
    type: "order_created",
    data: { code: created.code, service: service.title },
    url: `/orders/${created.code}`,
    entityType: "order",
    entityId: created.orderId,
  });

  return { ok: true, code: created.code };
}

/** ผู้ใช้คนนี้กำลังรอครีเอเตอร์คนนี้อยู่กี่งาน — ใช้เตือนก่อนสั่งซ้ำ */
export async function countActiveOrdersWith(creatorPageId: string): Promise<number> {
  const session = await getSession();
  if (!session) return 0;
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(schema.order)
    .where(
      and(
        eq(schema.order.creatorPageId, creatorPageId),
        eq(schema.order.clientUserId, session.user.id),
        inArray(schema.order.status, [...ACTIVE_STATUSES]),
      ),
    );
  return n;
}
