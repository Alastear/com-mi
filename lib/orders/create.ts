"use server";

import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { effectivePlan, PLANS, type PlanId } from "@/lib/billing/plans";
import { ACTIVE_STATUSES } from "@/lib/types";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { generateOrderCode } from "./code";
import { quoteOrder } from "./pricing";
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

/** สถานะร้านที่ยังรับคำขอใหม่ได้ — waitlist รับได้ แต่ลูกค้ารู้ว่าต้องรอ */
const ACCEPTING_STATUSES = new Set(["open", "waitlist"]);

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
  // สั่งงานร้านตัวเองไม่ได้ — ทำให้สถิติและโควตาเพี้ยนโดยไม่มีประโยชน์อะไร
  if (owner.id === session.user.id) return { ok: false, error: "own_shop" };

  const page = await db.query.creatorPage.findFirst({
    where: eq(schema.creatorPage.userId, owner.id),
    with: {
      services: {
        where: and(eq(schema.service.isActive, true), isNull(schema.service.deletedAt)),
        with: {
          tiers: true,
          options: true,
        },
      },
    },
  });
  if (!page || !page.isPublished) return { ok: false, error: "not_found" };
  // ร้านถูกผู้ดูแลระงับ = รับงานใหม่ไม่ได้ แต่ออเดอร์เดิมเดินต่อได้ตามปกติ
  // ตอบเหมือน "ร้านปิด" ไม่ใช่บอกว่าโดนระงับ — เรื่องระหว่างเรากับครีเอเตอร์
  if (page.suspendedAt) return { ok: false, error: "shop_closed" };
  if (!ACCEPTING_STATUSES.has(page.status)) return { ok: false, error: "shop_closed" };

  const service = page.services.find((s) => s.slug === v.slug);
  if (!service) return { ok: false, error: "not_found" };

  // โควตาออเดอร์ที่กำลังดำเนินอยู่ของ **ครีเอเตอร์** ไม่ใช่ของลูกค้า
  // — เป็นลิมิตของแพ็กเกจฝั่งคนรับงาน
  // โควตาของ **ครีเอเตอร์เจ้าของร้าน** ไม่ใช่ของลูกค้า — ช่วงเบต้ายกให้เท่า Pro
  const plan = effectivePlan((owner.plan ?? "free") as PlanId);
  const maxActive = PLANS[plan]?.limits.active_orders ?? PLANS.free.limits.active_orders;
  if (Number.isFinite(maxActive)) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.order)
      .where(
        and(
          eq(schema.order.creatorPageId, page.id),
          inArray(schema.order.status, [...ACTIVE_STATUSES]),
        ),
      );
    if (n >= maxActive) return { ok: false, error: "creator_full" };
  }

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

  const orderId = newId("ord");
  const now = new Date();
  const dueAt = new Date(now.getTime() + service.deliveryDays * 86_400_000);

  const values = {
    id: orderId,
    code: generateOrderCode(),
    creatorPageId: page.id,
    clientUserId: session.user.id,
    serviceId: service.id,
    status: "requested" as const,
    currency: "THB",
    subtotalCents: quote.subtotalCents,
    addonsCents: quote.addonsCents,
    totalCents: quote.totalCents,
    revisionsAllowed: service.revisionsIncluded,
    // แช่ TOS ฉบับที่ลูกค้าเห็นตอนกดยอมรับ — ครีเอเตอร์แก้ทีหลังไม่ย้อนหลังมาที่ออเดอร์นี้
    tosSnapshot: page.tos,
    acceptedTosAt: now,
    dueAt,
    isPublicInQueue: v.isPublicInQueue,
    createdAt: now,
    updatedAt: now,
  };

  /**
   * neon-http ไม่มี interactive transaction — ใช้ `batch()` ซึ่งรันทุกคำสั่ง
   * ในทรานแซกชันเดียวฝั่ง Neon ถ้าคำสั่งไหนพัง จะไม่มีออเดอร์ครึ่ง ๆ กลาง ๆ ค้างไว้
   *
   * โอกาส code ชนต่ำมาก (30^8) แต่ไม่ใช่ศูนย์ — ชนแล้วลองใหม่อีกครั้งหนึ่ง
   */
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = attempt === 0 ? values.code : generateOrderCode();

    const insertOrder = db.insert(schema.order).values({ ...values, code });
    const insertItems = db.insert(schema.orderItem).values(
      quote.lines.map((line, i) => ({
        id: newId("oitm"),
        orderId,
        /**
         * บรรทัดตัวคูณต้องแช่อัตราไว้ในข้อความด้วย
         *
         * `label` คือ "ข้อความที่ลูกค้าเห็นตอนสั่ง" ซึ่งบนหน้าจอคือ "ใช้เชิงพาณิชย์ (×2)"
         * ถ้าเก็บแค่ชื่อกับจำนวนเงิน ใบเสร็จจะอธิบายไม่ได้ว่าเงินก้อนนี้มาจากไหน
         * และย้อนกลับไปดูจากเมนูปัจจุบันก็ไม่ได้ เพราะครีเอเตอร์แก้อัตราทีหลังได้
         */
        label: line.multiplierBp
          ? `${line.label} (×${line.multiplierBp / 10_000})`
          : line.label,
        kind: line.kind,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
        sourceId: line.sourceId,
        sortOrder: i,
      })),
    );
    // event แรกของ timeline — เธรดกับ timeline เป็นสตรีมเดียวกัน
    const insertEvent = db.insert(schema.message).values({
      id: newId("msg"),
      orderId,
      senderUserId: session.user.id,
      isSystemEvent: true,
      eventType: "order_created",
      createdAt: now,
    });

    try {
      // แยกสองทางเพราะ batch() รับเป็น tuple — ใส่ array ที่ยาวไม่แน่นอนแล้ว type ไม่ผ่าน
      // และ .values([]) กับ array ว่างจะ generate SQL ที่พัง
      if (v.answers.length > 0) {
        const insertAnswers = db.insert(schema.orderAnswer).values(
          v.answers.map((a, i) => ({
            id: newId("oans"),
            orderId,
            fieldKey: a.key,
            fieldLabel: a.label,
            value: a.value,
            sortOrder: i,
          })),
        );
        await db.batch([insertOrder, insertItems, insertAnswers, insertEvent]);
      } else {
        await db.batch([insertOrder, insertItems, insertEvent]);
      }
      // ออเดอร์ใหม่คือแจ้งเตือนที่สำคัญที่สุดสำหรับครีเอเตอร์ — คือรายได้ที่เพิ่งเข้ามา
      await notify({
        userId: owner.id,
        actorUserId: session.user.id,
        type: "order_created",
        data: { code, service: service.title },
        url: `/orders/${code}`,
        entityType: "order",
        entityId: orderId,
      });

      return { ok: true, code };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (attempt === 0 && msg.includes("order_code_unique")) continue;
      throw err;
    }
  }

  return { ok: false, error: "invalid" };
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
