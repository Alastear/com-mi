"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/pg-error";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { notify } from "@/lib/notifications/create";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { isOrderCode } from "./code";
import { depositFor, quoteFromLines } from "./pricing";
import type { OrderStatus } from "@/lib/types";
import { startClockOnAcceptSet } from "./due-clock-sql";

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

/**
 * ล็อกแถวออเดอร์ก่อนแตะแถวใบเสนอราคา — แบบ **FOR NO KEY UPDATE** ไม่ใช่ FOR UPDATE
 *
 * ⚠️ FOR UPDATE กันไม่ให้ใครเพิ่มแถวลูกที่อ้างออเดอร์นี้ (FK check ต้องใช้ FOR KEY SHARE ซึ่งชนกับ
 * FOR UPDATE) แล้ว `issueQuote` บนออเดอร์ที่ `quoted` อยู่แล้วทำ [ปิดใบเก่า → เพิ่มใบใหม่ → เพิ่ม event]
 * โดยไม่ล็อกออเดอร์ก่อน: มันถือแถวใบเก่าแล้วรอ KEY SHARE บนออเดอร์ ขณะที่ `acceptQuote` ถือออเดอร์
 * แล้วรอแถวใบเก่า = deadlock (ลองจริงบน Postgres 18 แล้ว) NO KEY UPDATE ไม่ชนกับ KEY SHARE
 * ฝั่งออกใบจึงไปต่อได้ แล้ว `acceptQuote` เห็นใบเก่าถูกปิด → ตอบ `superseded`
 * ยังกันกันเองกับ batch เงินและ `transitionOrder` ได้เหมือนเดิม (NO KEY UPDATE ชนกับ FOR UPDATE)
 */
function lockOrderForQuote(orderId: string) {
  return getDb()
    .select({ id: schema.order.id })
    .from(schema.order)
    .where(eq(schema.order.id, orderId))
    .for("no key update");
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
  const at = now.toISOString();
  const quoteId = newId("quo");
  const expiresAt =
    expiresInDays > 0 ? new Date(now.getTime() + expiresInDays * 86_400_000) : null;

  /**
   * ⚠️ batch ไม่มี if — ทุกการเขียนข้างล่างต้องผูกกับ "ออเดอร์ยังอยู่ในสถานะที่เราอ่านมา" เอง
   *
   * ระหว่างที่เราอ่าน `from` ข้างบนกับตอน batch รัน ครีเอเตอร์อาจกดถอนใบจากอีกแท็บ (quoted → reviewing)
   * หรือลูกค้ากดยกเลิก (→ cancelled) ได้ ล็อกข้างล่างแค่ทำให้เรารอจนอีกฝั่ง commit — ไม่ได้หยุดเรา
   * เดิม batch ไม่มีเงื่อนไขสถานะเลย: ใบเปิดใบใหม่ + event "ออกใบเสนอราคา" ไปโผล่บนออเดอร์ที่ reviewing/cancelled
   * แล้วลูกค้ายังได้แจ้งเตือน/อีเมล "มีใบเสนอราคาใหม่" ที่กดยอมรับไม่ได้ (ลองจริงกับ DB แล้ว)
   *
   * ล็อกออเดอร์ก่อนแล้ว สถานะจึงไม่เปลี่ยนจนจบ batch — เช็ค `status = from` ในแต่ละคำสั่งได้ผลตรงกันทุกตัว
   * ⚠️ ห้ามใช้ "ออเดอร์เป็น quoted" แทน `status = from`: สองแท็บออกใบจาก reviewing พร้อมกัน
   * ตัวที่สองจะเห็น quoted ของตัวแรกแล้วเขียนทับไปเงียบ ๆ ทั้งที่หน้าจอของมันไม่เคยเห็นใบนั้น
   */
  const stillFrom = sql`exists (select 1 from "order" o where o.id = ${order.id} and o.status = ${from})`;
  /** แถวใบ id นี้มีอยู่ = batch นี้เป็นคนเพิ่มจริง (id เพิ่งสุ่มมา ไม่มีใครอื่นรู้) */
  const issuedHere = sql`exists (select 1 from order_quote q where q.id = ${quoteId})`;

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
        stillFrom,
      ),
    );

  /**
   * `insert ... select ... where` แทน `insert().values()` เพื่อให้มีเงื่อนไขได้ — แบบเดียวกับ `acceptQuote`
   * ทุกพารามิเตอร์มี cast เพราะใน select list Postgres เดาชนิดไม่ได้
   */
  const storedLines = quote.lines.map((l) => ({ label: l.label, amountCents: l.unitPriceCents }));
  const insert = db.execute(sql`
    insert into order_quote (id, order_id, created_by_user_id, lines, subtotal_cents, addons_cents,
                             total_cents, deposit_cents, note, expires_at, created_at)
    select ${quoteId}::text, ${order.id}::text, ${session.user.id}::text, ${JSON.stringify(storedLines)}::jsonb,
           ${quote.subtotalCents}::int, ${quote.addonsCents}::int, ${quote.totalCents}::int,
           ${depositCents}::int, ${note}::text, ${expiresAt ? expiresAt.toISOString() : null}::timestamptz,
           ${at}::timestamptz
    where ${stillFrom}
  `);

  /**
   * ไม่เรียก `assertTransition` — เครื่องสถานะไม่มีเส้นไหนเข้าสู่ `quoted` เลย
   * โดยตั้งใจ (เหตุผลอยู่ที่ `lib/orders/state-machine.ts`) ที่นี่จึงเป็นทางเดียว
   * ที่เขียนสถานะนี้ได้ และเขียนพร้อมแถวใบเสมอ ด่านคือ `QUOTABLE` ข้างบน
   * กับเงื่อนไข `status = from` + ใบที่เพิ่งเพิ่มใน batch นี้ ที่ผูกไว้กับคำสั่ง update ข้างล่าง
   */
  const promote = db
    .update(schema.order)
    .set({ status: "quoted", updatedAt: now })
    .where(and(eq(schema.order.id, order.id), eq(schema.order.status, from), issuedHere));

  /**
   * event ลงเธรดเฉพาะเมื่อใบนี้ถูกเพิ่มจริง — เธรดเป็นหลักฐานของทั้งสองฝั่ง ห้ามมี event ที่ไม่ได้เกิดขึ้น
   * ต้องบอกว่าใครทำ (actor) ไม่งั้น timeline ขึ้นว่า "โดยระบบ" ทั้งที่ครีเอเตอร์เป็นคนกด
   */
  const event = db.execute(sql`
    insert into message (id, order_id, sender_user_id, is_system_event, event_type, event_data, created_at)
    select ${newId("msg")}::text, ${order.id}::text, ${session.user.id}::text, true,
           'quote_issued'::text, ${JSON.stringify({ actor: "creator" })}::jsonb, ${at}::timestamptz
    where ${issuedHere}
  `);

  /** อ่านกลับใน batch เดียวกัน (เห็นสิ่งที่ batch นี้เขียน) — ว่างเปล่า = แพ้การแข่ง */
  const check = db
    .select({ id: schema.orderQuote.id })
    .from(schema.orderQuote)
    .where(eq(schema.orderQuote.id, quoteId));

  /**
   * ล็อกออเดอร์ก่อนแตะแถวใบ — ลำดับเดียวกับ `acceptQuote`/`withdrawQuote` (ดู `lockOrderForQuote`)
   * ไม่มีบรรทัดนี้: ถอนใบพร้อมออกใบใหม่จากอีกแท็บ ฝั่งถอนรอแถวใบเก่าแล้วปิดได้แค่ใบเก่า
   * (ใบใหม่ไม่อยู่ใน snapshot ของมัน) → ออเดอร์กลับไป reviewing พร้อมใบใหม่ที่ยังเปิดค้าง
   * = สภาพที่ `withdrawQuote` มีไว้กันไม่ให้เกิด (ลองจริงบน Postgres 18 แล้ว) มีบรรทัดนี้แล้วสองฝั่งเข้าคิวกัน
   * และทำให้ `status = from` ที่ทุกคำสั่งเช็คคงที่ตลอด batch
   */
  const lock = lockOrderForQuote(order.id);

  /**
   * ยิงพร้อมกันสองครั้งแล้วชน index `order_quote_live_idx` — ตอบว่าชนกัน
   * ไม่ใช่ปล่อยให้ throw ขึ้นไปเป็น 500 ที่ผู้ใช้อ่านไม่ออก
   *
   * ปุ่มบนหน้าจอกันคลิกซ้ำอยู่แล้วด้วย `useTransition` เส้นทางนี้จึงเหลือแค่
   * คนที่ยิง action ตรง ๆ — แต่ 500 ที่อธิบายไม่ได้ก็ยังเป็น 500 อยู่ดี
   */
  let issued: { id: string }[];
  try {
    issued =
      from !== "quoted"
        ? (await db.batch([lock, supersede, insert, promote, event, check]))[5]
        : (await db.batch([lock, supersede, insert, event, check]))[4];
  } catch (err) {
    if (isUniqueViolation(err, "order_quote_live_idx")) return { ok: false, error: "conflict" };
    throw err;
  }

  /**
   * แพ้การแข่ง — ออเดอร์ย้ายไปจากสถานะที่เราอ่านมาแล้ว ไม่มีอะไรถูกเขียน
   * ⚠️ ห้ามแจ้งเตือน: ลูกค้าจะได้อีเมล "ใบเสนอราคาใหม่" ที่เปิดมาแล้วไม่มีใบให้กด
   * หน้าจอครีเอเตอร์ขึ้นข้อความ "ออเดอร์เปลี่ยนไปแล้ว" แล้วรีเฟรช (ดู `issueQuoteFailure`)
   */
  if (issued.length === 0) return { ok: false, error: "wrong_status" };

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

  const at = now.toISOString();

  /**
   * "ใบนี้ถูกยอมรับโดย request นี้จริง" — accepted_at ตรงกับเวลาของ request นี้ถึงมิลลิวินาที
   *
   * batch ไม่มี if: คำสั่งทุกตัวรันเสมอ ถ้าไม่ผูกทุกการเขียนที่ตามมาไว้กับเงื่อนไขนี้
   * การกดที่แพ้ (กดซ้ำ ใบถูกแทนที่ระหว่างทาง ลูกค้ายกเลิกไปก่อน) จะยังลบบรรทัดราคาของออเดอร์
   * แล้วเขียนบรรทัดของใบที่ไม่ได้ถูกยอมรับลงไปแทน และทิ้ง event "ยอมรับใบเสนอราคา" ซ้ำในเธรด
   */
  const acceptedHere = sql`select 1 from order_quote q
    where q.id = ${quoteId} and q.accepted_at = ${at}::timestamptz`;

  const itemRows = sql.join(
    lines.map(
      (line, i) =>
        sql`(${newId("oitm")}::text, ${order.id}::text, ${line.label}::text, 'custom'::text,
             ${line.amountCents}::int, 1, null::text, ${i}::int)`,
    ),
    sql`, `,
  );

  const [, acceptedQuote, updatedOrder] = await db.batch([
    /**
     * ล็อกแถวออเดอร์ก่อนทุกอย่าง — สถานะที่คำสั่งถัดไปเห็นจะไม่เปลี่ยนจนจบ batch
     * ลำดับการล็อกเหมือนทุก batch ที่แตะออเดอร์: ออเดอร์ก่อน แล้วค่อยแถวลูก
     * ⚠️ NO KEY UPDATE ไม่ใช่ FOR UPDATE — เหตุผลอยู่ที่ `lockOrderForQuote`
     */
    lockOrderForQuote(order.id),

    /**
     * ⚠️ แถวใบคือตัวตัดสิน — compare-and-set ว่าใบยังเปิดอยู่ ยังไม่หมดอายุ และออเดอร์ยัง `quoted`
     *
     * เดิม UPDATE ออเดอร์เช็คแค่ `status = quoted` ไม่ได้เช็คใบ: ครีเอเตอร์ออกใบใหม่ทับพอดี
     * ระหว่างที่เราอ่านกับเขียน ออเดอร์ก็ยังเป็น `quoted` อยู่ UPDATE จึงผ่านและเขียนราคาของใบที่ตายแล้ว
     * ใบที่ถูกแทนที่แล้วถูกล็อกโดย `issueQuote` อยู่ = คำสั่งนี้รอ แล้วเช็คใหม่กับค่าที่ commit แล้วเอง
     */
    db
      .update(schema.orderQuote)
      .set({ acceptedAt: now })
      .where(
        and(
          eq(schema.orderQuote.id, quoteId),
          eq(schema.orderQuote.orderId, order.id),
          isNull(schema.orderQuote.acceptedAt),
          isNull(schema.orderQuote.supersededAt),
          sql`(${schema.orderQuote.expiresAt} is null or ${schema.orderQuote.expiresAt} > ${at}::timestamptz)`,
          sql`exists (select 1 from "order" o where o.id = ${order.id} and o.status = ${from})`,
        ),
      )
      .returning({ id: schema.orderQuote.id }),

    /**
     * ราคาจากใบลงออเดอร์ — เฉพาะเมื่อคำสั่งข้างบนเพิ่งยอมรับใบนี้จริง
     * ออเดอร์ถูกล็อกไว้แล้ว `status = quoted` จึงยังจริงเสมอถ้าคำสั่งข้างบนผ่าน สองคำสั่งนี้ผ่านหรือตกด้วยกัน
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
        /**
         * ใบไม่มีมัดจำ = ลูกค้ากดยอมรับตอนนี้คือตอนที่ครีเอเตอร์ได้รับกำหนดส่ง (เหตุผลที่ `clockStartsOnAccept`)
         * ⚠️ ส่งมัดจำ **ของใบ** — SET อ่านค่าก่อนเขียน `deposit_cents` ของแถวยังเป็นมัดจำก่อนเสนอราคา
         */
        ...startClockOnAcceptSet(now, quote.depositCents),
      })
      .where(
        and(
          eq(schema.order.id, order.id),
          eq(schema.order.status, from),
          sql`exists (${acceptedHere})`,
        ),
      )
      .returning({ id: schema.order.id }),

    // บรรทัดเดิมมาจากเมนูตอนสั่ง ตอนนี้ราคาไม่ได้มาจากเมนูแล้ว — ต้องหายไปทั้งชุด
    db
      .delete(schema.orderItem)
      .where(and(eq(schema.orderItem.orderId, order.id), sql`exists (${acceptedHere})`)),

    /**
     * `insert ... select ... where exists` แทน `insert().values()` เพื่อให้มีเงื่อนไขได้
     * ทุกพารามิเตอร์มี cast — ใน select list Postgres เดาชนิดไม่ได้และจะถือเป็น text
     */
    db.execute(sql`
      insert into order_item (id, order_id, label, kind, unit_price_cents, quantity, source_id, sort_order)
      select v.id, v.order_id, v.label, v.kind, v.unit_price_cents, v.quantity, v.source_id, v.sort_order
      from (values ${itemRows})
        as v (id, order_id, label, kind, unit_price_cents, quantity, source_id, sort_order)
      where exists (${acceptedHere})
    `),

    db.execute(sql`
      insert into message (id, order_id, sender_user_id, is_system_event, event_type, event_data, created_at)
      select ${newId("msg")}::text, ${order.id}::text, ${session.user.id}::text, true,
             'quote_accepted'::text, ${JSON.stringify({ actor: "client" })}::jsonb, ${at}::timestamptz
      where exists (${acceptedHere})
    `),
  ]);

  /**
   * ไม่มีแถวไหนถูกเขียน = แพ้การแข่ง ต้องไม่แจ้งเตือน (ซึ่งตอนนี้ส่งอีเมลด้วย) และตอบให้ตรงเรื่อง
   * หน้าจอรีเฟรชจาก error เหล่านี้ทุกตัว รวม `wrong_status` (ดู `acceptQuoteFailure` ใน labels.ts)
   * จะได้เห็นใบใหม่หรือสถานะล่าสุด
   */
  if (acceptedQuote.length === 0 || updatedOrder.length === 0) {
    const [freshQuote, freshOrder] = await Promise.all([
      db.query.orderQuote.findFirst({
        where: eq(schema.orderQuote.id, quoteId),
        columns: { acceptedAt: true, supersededAt: true, expiresAt: true },
      }),
      db.query.order.findFirst({
        where: eq(schema.order.id, order.id),
        columns: { status: true },
      }),
    ]);
    // กดซ้ำหลังสำเร็จไปแล้ว — ไม่ใช่ error และห้ามแจ้งเตือนซ้ำ
    if (freshQuote?.acceptedAt && freshOrder?.status === "accepted") return { ok: true };
    if (freshOrder?.status !== "quoted") return { ok: false, error: "wrong_status" };
    if (freshQuote?.expiresAt && freshQuote.expiresAt.getTime() <= Date.now()) {
      return { ok: false, error: "expired" };
    }
    return { ok: false, error: "superseded" };
  }

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
  const at = now.toISOString();
  /**
   * "request นี้เป็นคนถอนจริง" — ออเดอร์เป็น reviewing ที่ updated_at ตรงกับเวลาของ request นี้
   * ⚠️ batch ไม่มี if: ถ้าไม่ผูก event ไว้กับเงื่อนไขนี้ ลูกค้ากดยอมรับชนะไปก่อน (ออเดอร์ accepted แล้ว)
   * เรายังเขียน "ครีเอเตอร์ถอนใบเสนอราคา" ลงเธรดทั้งที่ไม่ได้ถอนอะไร และตอบ ok ให้ครีเอเตอร์เห็นว่าถอนแล้ว
   * เธรดเป็นหลักฐานของทั้งสองฝั่ง ห้ามมี event ที่ไม่ได้เกิดขึ้นจริง (เจอจริงตอนทดสอบกดสองฝั่งพร้อมกัน)
   */
  const withdrawnHere = sql`select 1 from "order" o
    where o.id = ${order.id} and o.status = 'reviewing' and o.updated_at = ${at}::timestamptz`;
  const stillQuoted = sql`exists (select 1 from "order" o where o.id = ${order.id} and o.status = 'quoted')`;

  const [, , updatedOrder] = await db.batch([
    /**
     * ⚠️ ล็อกออเดอร์ก่อนแตะแถวใบ — ลำดับเดียวกับ `acceptQuote` (ออเดอร์ก่อน แล้วค่อยแถวลูก)
     * ไม่มีบรรทัดนี้ = deadlock: เราล็อกแถวใบ (ปิดใบ) แล้วรอแถวออเดอร์ ขณะที่ `acceptQuote` ของลูกค้า
     * ถือแถวออเดอร์แล้วรอแถวใบเดียวกัน Postgres ฆ่าฝั่งหนึ่งทิ้งเป็น 40P01 ซึ่งไม่มีใครจับ = error 500
     * มีบรรทัดนี้แล้ว ใครได้ล็อกออเดอร์ก่อนก็ทำจนจบ อีกฝั่งรอแล้วเห็นผลที่ commit แล้ว
     * และเพราะล็อกไว้แล้ว สถานะที่คำสั่งถัด ๆ ไปเห็นจึงไม่เปลี่ยนจนจบ batch
     */
    lockOrderForQuote(order.id),
    // ปิดใบเฉพาะตอนออเดอร์ยัง quoted — ลูกค้ายกเลิกไปก่อนแล้วก็ไม่ต้องไปแตะแถวใบ
    db
      .update(schema.orderQuote)
      .set({ supersededAt: now })
      .where(
        and(
          eq(schema.orderQuote.orderId, order.id),
          isNull(schema.orderQuote.supersededAt),
          isNull(schema.orderQuote.acceptedAt),
          stillQuoted,
        ),
      ),
    /**
     * กลับไป `reviewing` ไม่ใช่ `requested` — ครีเอเตอร์อ่านงานนี้ไปแล้ว
     * และเงื่อนไขท้ายบรรทัดกันกรณีลูกค้ากดยอมรับพอดีในเสี้ยววินาทีเดียวกัน
     */
    db
      .update(schema.order)
      .set({ status: "reviewing", updatedAt: now })
      .where(and(eq(schema.order.id, order.id), eq(schema.order.status, "quoted")))
      .returning({ id: schema.order.id }),
    db.execute(sql`
      insert into message (id, order_id, sender_user_id, is_system_event, event_type, event_data, created_at)
      select ${newId("msg")}::text, ${order.id}::text, ${session.user.id}::text, true,
             'quote_withdrawn'::text, ${JSON.stringify({ actor: "creator" })}::jsonb, ${at}::timestamptz
      where exists (${withdrawnHere})
    `),
  ]);

  // แพ้การแข่ง (ลูกค้ายอมรับหรือยกเลิกไปก่อน) — บอกตามจริง หน้าจอรีเฟรชให้เห็นสถานะล่าสุด
  if (updatedOrder.length === 0) return { ok: false, error: "wrong_status" };

  revalidateBothSides(code);
  return { ok: true };
}
