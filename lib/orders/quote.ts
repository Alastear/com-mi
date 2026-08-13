"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { notify } from "@/lib/notifications/create";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { isOrderCode } from "./code";
import { depositFor, quoteFromLines } from "./pricing";
import type { OrderStatus } from "@/lib/types";

/**
 * ใบเสนอราคาที่ครีเอเตอร์เขียนเอง
 *
 * เจ้าของสั่งไว้ว่า "ครีเอเตอร์สร้างใบเสนอราคาของงานเองได้แล้วส่งให้ผู้ว่าจ้างจ่าย
 * ไม่จำเป็นต้องให้ผู้มาจ้างงานกดเอง" — เพราะราคาจริงมักตกลงกันในแชตก่อน
 * แล้วค่อยมาหาว่าจะให้ลูกค้ากดอะไรถึงจะได้ตัวเลขนั้น
 *
 * ⚠️ **เส้นแบ่งที่ห้ามข้าม: ครีเอเตอร์ตั้งราคาได้ แต่เขียน `order.totalCents` ไม่ได้**
 *
 * `issueQuote` เขียนแค่แถวใบเสนอราคา ส่วน `acceptQuote` คือที่เดียวในไฟล์นี้
 * ที่แตะเงินบนออเดอร์ และมันรับ `quoteId` เข้ามาด้วยเสมอ
 *
 * เหตุผลที่ต้องระบุใบ ไม่ใช่แค่ "ยอมรับออเดอร์นี้": ลูกค้าเปิดหน้าค้างไว้
 * ครีเอเตอร์ออกใบใหม่ราคาสูงกว่า ลูกค้ากดปุ่มเดิมที่ยังค้างอยู่บนจอ —
 * ถ้าไม่ระบุใบ ลูกค้าจะผูกพันกับตัวเลขที่ไม่เคยอ่าน ระบุแล้วจะกดไม่ผ่าน
 * เพราะใบนั้นถูกปิดไปแล้ว และหน้าจอจะรีเฟรชมาให้อ่านใบใหม่
 */

/**
 * ออเดอร์หนึ่งใบมีสองหน้า — ของครีเอเตอร์กับของลูกค้า
 * ใครกดอะไรก็กระทบทั้งคู่เสมอ จึงล้างทั้งสองทางทุกครั้ง ไม่ใช่เฉพาะฝั่งคนกด
 */
function revalidateBothSides(code: string) {
  revalidatePath(`/orders/${code}`);
  revalidatePath(`/my/requests/${code}`);
}

/* ── ออกใบ ────────────────────────────────────────────────────────── */

const LineSchema = z.object({
  label: z.string().trim().min(1).max(120),
  /** รับเป็นสตางค์ ฟอร์มแปลงจากบาทให้แล้ว */
  amountCents: z.number().int().min(-9_999_999_00).max(9_999_999_00),
});

const IssueSchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  lines: z.array(LineSchema).min(1).max(20),
  /** เปอร์เซ็นต์มัดจำ 0 = ไม่บังคับมัดจำ */
  depositPercent: z.number().int().min(0).max(100),
  note: z.string().trim().max(1000).default(""),
  /** อายุใบเป็นวัน — 0 = ไม่มีวันหมดอายุ */
  expiresInDays: z.number().int().min(0).max(60).default(14),
});

export type IssueQuoteResult =
  | { ok: true; quoteId: string }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "not_found"
        | "invalid"
        | "wrong_status"
        | "empty"
        | "too_large"
        | "conflict"
        | "rate_limited"
        | "shop_suspended";
    };

/** สถานะที่ยังออกใบเสนอราคาได้ — หลังลูกค้าตอบรับแล้วราคาถือว่าตกลงกันแล้ว */
const QUOTABLE: readonly OrderStatus[] = ["requested", "reviewing", "quoted"];

/** เพดานต่อใบ ฿500,000 — กันนิ้วพลาดที่กลายเป็นตัวเลขข่มขู่ลูกค้า */
const MAX_TOTAL_CENTS = 500_000_00;

export async function issueQuote(input: z.input<typeof IssueSchema>): Promise<IssueQuoteResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = IssueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, lines, depositPercent, note, expiresInDays } = parsed.data;

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, status: true, clientUserId: true },
    with: { page: { columns: { userId: true, suspendedAt: true } } },
  });
  if (!order) return { ok: false, error: "not_found" };

  // ครีเอเตอร์เจ้าของออเดอร์เท่านั้น — คนอื่นตอบเหมือนไม่มีออเดอร์นี้อยู่
  if (order.page.userId !== session.user.id) return { ok: false, error: "not_found" };

  /**
   * ร้านที่ถูกผู้ดูแลระงับต้องตั้งราคาใหม่ไม่ได้
   *
   * `createOrder` กันไว้แล้วที่ `lib/orders/create.ts:104` แต่ทางนี้เป็นอีกทางที่
   * พาไปถึงสถานะจ่ายเงินได้เหมือนกัน — ลูกค้ากดยอมรับแล้ว `canPay()` เปิดทันที
   * การระงับที่กันแค่ทางเดียวไม่ใช่การระงับ
   */
  if (order.page.suspendedAt) return { ok: false, error: "shop_suspended" };

  const gate = await rateLimit(
    `quote:${session.user.id}`,
    LIMITS.issueQuote.limit,
    LIMITS.issueQuote.windowSeconds,
  );
  if (!gate.ok) return { ok: false, error: "rate_limited" };

  const from = order.status as OrderStatus;
  if (!QUOTABLE.includes(from)) return { ok: false, error: "wrong_status" };

  /**
   * `quoteFromLines` ทิ้งบรรทัดที่ไม่มีชื่อหรือยอดเป็นศูนย์ — ใบที่เหลือศูนย์บรรทัด
   * คือฟอร์มที่กรอกไม่ครบ ไม่ใช่ใบราคาศูนย์บาท
   */
  const quote = quoteFromLines(lines);
  if (quote.lines.length === 0 || quote.totalCents <= 0) return { ok: false, error: "empty" };
  if (quote.totalCents > MAX_TOTAL_CENTS) return { ok: false, error: "too_large" };

  /**
   * มัดจำคิดจากยอดรวมแล้วปัดเป็นบาทเต็ม และไม่มีทางเกินยอดรวม
   *
   * เก็บเป็นจำนวนเงินไม่ใช่เปอร์เซ็นต์ เพราะด่าน `depositSatisfied()` เทียบกับ
   * `amountPaidCents` ตรง ๆ ถ้าเก็บเป็นเปอร์เซ็นต์ก็ต้องคำนวณซ้ำทุกที่ที่ใช้
   * และเปอร์เซ็นต์ที่คำนวณจากยอดคนละรอบมีสิทธิ์ได้เลขคนละตัว
   */
  const depositCents = depositFor(quote.totalCents, depositPercent);

  const now = new Date();
  const quoteId = newId("quo");
  const expiresAt =
    expiresInDays > 0 ? new Date(now.getTime() + expiresInDays * 86_400_000) : null;

  /**
   * ออกใบใหม่ = ปิดใบเก่าก่อน ไม่ใช่เขียนทับ
   *
   * dbindex `order_quote_live_idx` บังคับว่ามีใบเปิดอยู่ได้ใบเดียวต่อออเดอร์
   * การปิดกับการเปิดจึงต้องอยู่ใน batch เดียวกัน ไม่งั้นชนกันเองตอนกดรัว ๆ
   */
  const supersede = db
    .update(schema.orderQuote)
    .set({ supersededAt: now })
    .where(
      and(
        eq(schema.orderQuote.orderId, order.id),
        isNull(schema.orderQuote.supersededAt),
        isNull(schema.orderQuote.acceptedAt),
      ),
    );

  const insert = db.insert(schema.orderQuote).values({
    id: quoteId,
    orderId: order.id,
    createdByUserId: session.user.id,
    lines: quote.lines.map((l) => ({ label: l.label, amountCents: l.unitPriceCents })),
    subtotalCents: quote.subtotalCents,
    addonsCents: quote.addonsCents,
    totalCents: quote.totalCents,
    depositCents,
    note,
    expiresAt,
    createdAt: now,
  });

  const event = db.insert(schema.message).values({
    id: newId("msg"),
    orderId: order.id,
    senderUserId: session.user.id,
    isSystemEvent: true,
    eventType: "quote_issued",
    // ต้องบอกว่าใครทำ ไม่งั้น timeline ขึ้นว่า "โดยระบบ" ทั้งที่ครีเอเตอร์เป็นคนกด
    eventData: { actor: "creator" },
    createdAt: now,
  });

  /**
   * ไม่เรียก `assertTransition` — เครื่องสถานะไม่มีเส้นไหนเข้าสู่ `quoted` เลย
   * โดยตั้งใจ (เหตุผลอยู่ที่ `lib/orders/state-machine.ts`) ที่นี่จึงเป็นทางเดียว
   * ที่เขียนสถานะนี้ได้ และเขียนพร้อมแถวใบเสมอ ด่านคือ `QUOTABLE` ข้างบน
   * กับเงื่อนไข `where status = from` ที่ผูกไว้กับคำสั่ง update ข้างล่าง
   */

  /**
   * ยิงพร้อมกันสองครั้งแล้วชน index `order_quote_live_idx` — ตอบว่าชนกัน
   * ไม่ใช่ปล่อยให้ throw ขึ้นไปเป็น 500 ที่ผู้ใช้อ่านไม่ออก
   *
   * ปุ่มบนหน้าจอกันคลิกซ้ำอยู่แล้วด้วย `useTransition` เส้นทางนี้จึงเหลือแค่
   * คนที่ยิง action ตรง ๆ — แต่ 500 ที่อธิบายไม่ได้ก็ยังเป็น 500 อยู่ดี
   */
  try {
    await db.batch(
      from !== "quoted"
        ? [
            supersede,
            insert,
            db
              .update(schema.order)
              .set({ status: "quoted", updatedAt: now })
              /**
       * เงื่อนไขนี้คือด่านกันกดซ้ำ **และ** กันการยอมรับใบที่เพิ่งถูกแทนที่ไป
       *
       * ระหว่างที่เราอ่านใบมาแล้วกำลังจะเขียน ครีเอเตอร์อาจออกใบใหม่ทับพอดี
       * การอ่านแล้วค่อยเขียนโดยไม่ผูกเงื่อนไขกลับไปที่แถวใบ จะเขียนราคาของใบที่ตายแล้ว
       */
      .where(
        and(
          eq(schema.order.id, order.id),
          eq(schema.order.status, from),
          sql`exists (
            select 1 from ${schema.orderQuote} q
            where q.id = ${quoteId} and q.accepted_at is null and q.superseded_at is null
          )`,
        ),
      ),
            event,
          ]
        : [supersede, insert, event],
    );
  } catch (err) {
    if (String(err).includes("order_quote_live_idx")) return { ok: false, error: "conflict" };
    throw err;
  }

  if (order.clientUserId) {
    await notify({
      userId: order.clientUserId,
      actorUserId: session.user.id,
      type: "quote_issued",
      data: { code },
      // ⚠️ หน้าของ **ลูกค้า** — `/orders/…` เป็นเส้นทางฝั่งครีเอเตอร์ในกลุ่ม (app)
      // ผู้ซื้อที่ไม่มีร้านกดแล้วจะถูกส่งไป onboarding "สร้างร้าน" แทนที่จะเห็นใบเสนอราคา
      url: `/my/requests/${code}`,
      entityType: "order",
      entityId: order.id,
    });
  }

  revalidateBothSides(code);
  return { ok: true, quoteId };
}

/* ── ยอมรับใบ ─────────────────────────────────────────────────────── */

const AcceptSchema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  quoteId: z.string().min(1).max(64),
});

export type AcceptQuoteResult =
  | { ok: true }
  | {
      ok: false;
      error: "unauthenticated" | "not_found" | "invalid" | "wrong_status" | "superseded" | "expired";
    };

/**
 * ลูกค้ากดยอมรับ — **จุดเดียวที่ราคาจากใบเสนอราคาถูกเขียนลงออเดอร์**
 *
 * เขียนทั้งราคา มัดจำ รายการบรรทัด และสถานะในการเรียก `batch()` ครั้งเดียว
 * ออเดอร์ที่มีราคาใหม่แต่ยังโชว์บรรทัดเก่าจึงไม่มีทางเกิดขึ้น
 */
export async function acceptQuote(input: z.input<typeof AcceptSchema>): Promise<AcceptQuoteResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = AcceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, quoteId } = parsed.data;

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, status: true, clientUserId: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order) return { ok: false, error: "not_found" };

  // ลูกค้าเจ้าของออเดอร์เท่านั้น — ครีเอเตอร์กดยอมรับใบของตัวเองไม่ได้
  if (!order.clientUserId || order.clientUserId !== session.user.id) {
    return { ok: false, error: "not_found" };
  }

  /**
   * เช็คสถานะตรง ๆ ไม่เรียก `assertTransition` — เส้น `quoted → accepted`
   * ถูกถอดออกจากเครื่องสถานะแล้วโดยตั้งใจ เพื่อไม่ให้มีปุ่มธรรมดาที่ยอมรับ
   * โดยไม่พกราคาไปด้วย (เหตุผลเต็มอยู่ที่ `lib/orders/state-machine.ts`)
   * ที่นี่จึงเป็น **ทางเดียว** ที่ออเดอร์เดินจาก `quoted` ไป `accepted` ได้
   */
  const from = order.status as OrderStatus;
  if (from !== "quoted") return { ok: false, error: "wrong_status" };

  const quote = await db.query.orderQuote.findFirst({
    where: eq(schema.orderQuote.id, quoteId),
  });
  // ใบของออเดอร์อื่นถือว่าไม่มีอยู่ — ห้ามให้ id หลุดมาจากที่อื่นแล้วใช้ได้
  if (!quote || quote.orderId !== order.id) return { ok: false, error: "not_found" };
  if (quote.supersededAt || quote.acceptedAt) return { ok: false, error: "superseded" };

  const now = new Date();
  if (quote.expiresAt && quote.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "expired" };
  }

  /**
   * ใบต้องมีบรรทัดจริง — `issueQuote` กันไว้แล้วตั้งแต่ต้นทาง แต่ถ้าเกิดมีแถวว่าง
   * หลุดมาได้ `insert().values([])` จะสร้าง SQL ที่พังทั้ง batch
   * (ทั้งราคาและสถานะจึงไม่ถูกเขียน) — ตอบว่าไม่พบดีกว่าปล่อยให้ throw
   */
  const lines = quote.lines ?? [];
  if (lines.length === 0) return { ok: false, error: "not_found" };

  await db.batch([
    /**
     * ⚠️ เงื่อนไขท้ายบรรทัดคือด่านกันกดซ้ำ
     *
     * `status = quoted` และ `accepted_at is null` ทำให้การกดครั้งที่สอง
     * อัปเดตศูนย์แถว แทนที่จะเขียนราคาทับรอบสอง — ซึ่งถ้าเป็นใบคนละใบ
     * จะกลายเป็นเปลี่ยนราคาออเดอร์ที่ตกลงกันไปแล้ว
     */
    db
      .update(schema.order)
      .set({
        status: "accepted",
        subtotalCents: quote.subtotalCents,
        addonsCents: quote.addonsCents,
        totalCents: quote.totalCents,
        depositCents: quote.depositCents,
        updatedAt: now,
      })
      .where(and(eq(schema.order.id, order.id), eq(schema.order.status, from))),

    db
      .update(schema.orderQuote)
      .set({ acceptedAt: now })
      .where(
        and(
          eq(schema.orderQuote.id, quoteId),
          isNull(schema.orderQuote.acceptedAt),
          isNull(schema.orderQuote.supersededAt),
        ),
      ),

    // บรรทัดเดิมมาจากเมนูตอนสั่ง ตอนนี้ราคาไม่ได้มาจากเมนูแล้ว — ต้องหายไปทั้งชุด
    db.delete(schema.orderItem).where(eq(schema.orderItem.orderId, order.id)),

    db.insert(schema.orderItem).values(
      lines.map((line, i) => ({
        id: newId("oitm"),
        orderId: order.id,
        label: line.label,
        kind: "custom",
        unitPriceCents: line.amountCents,
        quantity: 1,
        sourceId: null,
        sortOrder: i,
      })),
    ),

    db.insert(schema.message).values({
      id: newId("msg"),
      orderId: order.id,
      senderUserId: session.user.id,
      isSystemEvent: true,
      eventType: "quote_accepted",
      eventData: { actor: "client" },
      createdAt: now,
    }),
  ]);

  await notify({
    userId: order.page.userId,
    actorUserId: session.user.id,
    type: "quote_accepted",
    data: { code },
    url: `/orders/${code}`,
    entityType: "order",
    entityId: order.id,
  });

  revalidateBothSides(code);
  return { ok: true };
}


/* ── ถอนใบ ────────────────────────────────────────────────────────── */

const WithdrawSchema = z.object({ code: z.string().refine(isOrderCode, "bad_code") });

export type WithdrawQuoteResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "not_found" | "invalid" | "wrong_status" };

/**
 * ครีเอเตอร์ถอนใบเสนอราคาที่ส่งไปแล้ว
 *
 * ก่อนหน้านี้แก้ได้ทางเดียวคือออกใบใหม่ทับ ซึ่งบังคับให้ต้องเสนอราคาอะไรสักอย่างเสมอ
 * ทั้งที่บางทีคำตอบคือ "ขอคิดใหม่ก่อน" หรือ "ส่งผิดคน" — และใบที่ค้างอยู่ระหว่างนั้น
 * ลูกค้ากดยอมรับได้ตลอดเวลา
 *
 * ปิดแถวใบกับเปลี่ยนสถานะต้องอยู่ใน `batch()` เดียวกัน ไม่งั้นจะเหลือใบที่เปิดอยู่
 * บนออเดอร์ที่ไม่ใช่ `quoted` — สถานะที่ลูกค้ากดยอมรับไม่ได้ และครีเอเตอร์ก็ออกใบใหม่
 * ไม่ได้ เพราะ index บังคับว่ามีใบเปิดได้ใบเดียวต่อออเดอร์
 */
export async function withdrawQuote(
  input: z.input<typeof WithdrawSchema>,
): Promise<WithdrawQuoteResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = WithdrawSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code } = parsed.data;

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, status: true, clientUserId: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order) return { ok: false, error: "not_found" };
  if (order.page.userId !== session.user.id) return { ok: false, error: "not_found" };
  if (order.status !== "quoted") return { ok: false, error: "wrong_status" };

  const now = new Date();
  await db.batch([
    db
      .update(schema.orderQuote)
      .set({ supersededAt: now })
      .where(
        and(
          eq(schema.orderQuote.orderId, order.id),
          isNull(schema.orderQuote.supersededAt),
          isNull(schema.orderQuote.acceptedAt),
        ),
      ),
    /**
     * กลับไป `reviewing` ไม่ใช่ `requested` — ครีเอเตอร์อ่านงานนี้ไปแล้ว
     * และเงื่อนไขท้ายบรรทัดกันกรณีลูกค้ากดยอมรับพอดีในเสี้ยววินาทีเดียวกัน
     */
    db
      .update(schema.order)
      .set({ status: "reviewing", updatedAt: now })
      .where(and(eq(schema.order.id, order.id), eq(schema.order.status, "quoted"))),
    db.insert(schema.message).values({
      id: newId("msg"),
      orderId: order.id,
      senderUserId: session.user.id,
      isSystemEvent: true,
      eventType: "quote_withdrawn",
      eventData: { actor: "creator" },
      createdAt: now,
    }),
  ]);

  revalidateBothSides(code);
  return { ok: true };
}
