"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { requireCreator } from "@/lib/auth-guard";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { quoteFromLines, depositFor } from "./pricing";
import { assertCanAcceptNewOrder } from "./new-order";
import { generateInviteToken } from "./invite-token";

/**
 * ใบเชิญลูกค้า — ฝั่งครีเอเตอร์
 *
 * ครีเอเตอร์ร่างงานกับราคาไว้ก่อน แล้วส่งลิงก์ให้ลูกค้ามากดรับ
 * ใช้กับงานที่ตกลงกันในแชตจนจบแล้ว ลูกค้าจะได้ไม่ต้องมานั่งกรอกฟอร์มบรีฟซ้ำ
 *
 * ⚠️ **การกดลิงก์ยังไม่สร้างออเดอร์** และไฟล์นี้ไม่มีทางสร้างออเดอร์เลย —
 * ออเดอร์เกิดได้ที่ `lib/orders/new-order.ts` ที่เดียว ตอนครีเอเตอร์กดยืนยันคำขอ
 *
 * ⚠️ **ทุกใบต้องระบุอีเมล** ไม่มีแบบ "ใครถือลิงก์ก็กดได้"
 * เหตุผลเต็มอยู่ใน `docs/06-quotes-and-invites.md` §4.6 ย่อ ๆ คือ ชื่อกับรูปผู้ใช้
 * แก้เองได้ อีเมลแก้ไม่ได้ — ถ้าไม่มีอีเมลให้เทียบ การเห็นว่าใครมากดไม่ได้บอกอะไรเลย
 * และปุ่มกดรับจะกลายเป็นเครื่องเก็บอีเมลของคนที่หลงกดตามลิงก์ที่ถูกส่งต่อมา
 */

const LineSchema = z.object({
  label: z.string().trim().min(1).max(120),
  amountCents: z.number().int().min(-9_999_999_00).max(9_999_999_00),
});

/** เพดานต่อใบ ฿500,000 — เท่ากับใบเสนอราคา */
const MAX_TOTAL_CENTS = 500_000_00;

const CreateSchema = z.object({
  /** เก็บเป็นตัวพิมพ์เล็กเสมอ — Better Auth ก็ lowercase ตอนสมัคร ทั้งสองฝั่งจึงตรงกัน */
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(200)),
  serviceSlug: z.string().min(1).max(120),
  lines: z.array(LineSchema).min(1).max(20),
  depositPercent: z.number().int().min(0).max(100),
  note: z.string().trim().max(1000).default(""),
  expiresInDays: z.number().int().min(0).max(60).default(14),
});

export type InviteResult =
  | { ok: true; token: string }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "not_found"
        | "shop_closed"
        | "empty"
        | "too_large"
        | "rate_limited";
    };

export async function createInvite(input: z.input<typeof CreateSchema>): Promise<InviteResult> {
  const { user } = await requireCreator();

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  const gate = await rateLimit(
    `invite:${user.id}`,
    LIMITS.createInvite.limit,
    LIMITS.createInvite.windowSeconds,
  );
  if (!gate.ok) return { ok: false, error: "rate_limited" };

  const db = getDb();
  const page = await db.query.creatorPage.findFirst({
    where: eq(schema.creatorPage.userId, user.id),
    with: {
      services: {
        where: and(eq(schema.service.isActive, true), isNull(schema.service.deletedAt)),
      },
    },
  });
  if (!page) return { ok: false, error: "not_found" };

  /**
   * ตรวจสภาพร้านตั้งแต่ตอนออกใบ ทั้งที่ด่านจริงอยู่ตอนกดยืนยัน
   *
   * ไม่ได้ทำแทนกัน — ทำเพื่อไม่ให้ครีเอเตอร์ส่งลิงก์ออกไปแล้วค่อยมารู้ทีหลังว่า
   * ร้านตัวเองปิดรับงานอยู่ ลูกค้าจะได้ไม่กดรับแล้วเจอปฏิเสธ
   * (ยังไม่รู้ว่าใครจะกด จึงไม่ส่ง `clientUserId` — ข้อ "ร้านตัวเอง" เช็คตอนยืนยัน)
   */
  const shopGate = assertCanAcceptNewOrder({ page, owner: { id: user.id } });
  if (!shopGate.ok) {
    return { ok: false, error: shopGate.error === "own_shop" ? "invalid" : shopGate.error };
  }

  const service = page.services.find((s) => s.slug === v.serviceSlug);
  // ไม่มีบริการที่เปิดอยู่ = ออกใบไม่ได้ ออเดอร์ต้องผูกกับบริการเสมอ
  if (!service) return { ok: false, error: "not_found" };

  const quote = quoteFromLines(v.lines);
  if (quote.lines.length === 0 || quote.totalCents <= 0) return { ok: false, error: "empty" };
  if (quote.totalCents > MAX_TOTAL_CENTS) return { ok: false, error: "too_large" };

  const now = new Date();
  const inviteId = newId("inv");
  const token = generateInviteToken();
  const expiresAt =
    v.expiresInDays > 0 ? new Date(now.getTime() + v.expiresInDays * 86_400_000) : null;

  await db.batch([
    db.insert(schema.orderInvite).values({
      id: inviteId,
      token,
      creatorPageId: page.id,
      createdByUserId: user.id,
      serviceId: service.id,
      email: v.email,
      expiresAt,
      createdAt: now,
    }),
    db.insert(schema.orderInviteRevision).values({
      id: newId("irev"),
      inviteId,
      createdByUserId: user.id,
      lines: quote.lines.map((l) => ({ label: l.label, amountCents: l.unitPriceCents })),
      subtotalCents: quote.subtotalCents,
      addonsCents: quote.addonsCents,
      totalCents: quote.totalCents,
      depositCents: depositFor(quote.totalCents, v.depositPercent),
      note: v.note,
      /**
       * แช่เงื่อนไขจากเมนู ณ วินาทีนี้ — ไม่อ่านสดตอนลูกค้ากดรับหรือตอนยืนยัน
       * ระหว่างนั้นครีเอเตอร์แก้กำหนดส่ง จำนวนรอบแก้ และข้อตกลงของร้านได้ตลอด
       * ลูกค้าต้องได้เงื่อนไขชุดที่ตัวเองอ่าน ไม่ใช่ชุดล่าสุด
       */
      deliveryDays: service.deliveryDays,
      revisionsIncluded: service.revisionsIncluded,
      tosSnapshot: page.tos,
      expiresAt,
      createdAt: now,
    }),
  ]);

  revalidatePath("/invites");
  return { ok: true, token };
}

/* ── ออกฉบับใหม่ทับฉบับเดิม ────────────────────────────────────────── */

const ReviseSchema = z.object({
  inviteId: z.string().min(1).max(64),
  lines: z.array(LineSchema).min(1).max(20),
  depositPercent: z.number().int().min(0).max(100),
  note: z.string().trim().max(1000).default(""),
});

export type ReviseResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "not_found"
        | "empty"
        | "too_large"
        | "closed"
        | "conflict"
        | "rate_limited";
    };

/**
 * แก้ราคา = ออกฉบับใหม่ทับ ไม่ใช่เขียนทับฉบับเดิม
 *
 * เหมือน `issueQuote()` ทุกประการและด้วยเหตุผลเดียวกัน: ลูกค้าเปิดหน้าค้างไว้
 * ครีเอเตอร์ขึ้นราคา ลูกค้ากดปุ่มเดิมที่ยังอยู่บนจอ — ปุ่มกดรับส่ง `revisionId`
 * ไปด้วยเสมอ ฉบับที่ถูกแทนแล้วจึงกดไม่ผ่าน แล้วหน้าจอรีเฟรชมาให้อ่านฉบับใหม่
 */
export async function reviseInvite(input: z.input<typeof ReviseSchema>): Promise<ReviseResult> {
  const { user } = await requireCreator();

  const parsed = ReviseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  const gate = await rateLimit(
    `invite:${user.id}`,
    LIMITS.createInvite.limit,
    LIMITS.createInvite.windowSeconds,
  );
  if (!gate.ok) return { ok: false, error: "rate_limited" };

  const db = getDb();
  const invite = await db.query.orderInvite.findFirst({
    where: eq(schema.orderInvite.id, v.inviteId),
    with: { page: { columns: { userId: true, tos: true } }, service: true },
  });
  if (!invite || invite.page.userId !== user.id) return { ok: false, error: "not_found" };
  // ใบที่ปิดไปแล้วแก้ราคาไม่ได้ — ทั้งที่ถูกเพิกถอนและที่กลายเป็นออเดอร์ไปแล้ว
  if (invite.revokedAt || invite.confirmedAt) return { ok: false, error: "closed" };
  if (!invite.service) return { ok: false, error: "not_found" };

  const quote = quoteFromLines(v.lines);
  if (quote.lines.length === 0 || quote.totalCents <= 0) return { ok: false, error: "empty" };
  if (quote.totalCents > MAX_TOTAL_CENTS) return { ok: false, error: "too_large" };

  const now = new Date();
  try {
    await db.batch([
      db
        .update(schema.orderInviteRevision)
        .set({ supersededAt: now })
        .where(
          and(
            eq(schema.orderInviteRevision.inviteId, invite.id),
            isNull(schema.orderInviteRevision.supersededAt),
            isNull(schema.orderInviteRevision.acceptedAt),
          ),
        ),
      db.insert(schema.orderInviteRevision).values({
        id: newId("irev"),
        inviteId: invite.id,
        createdByUserId: user.id,
        lines: quote.lines.map((l) => ({ label: l.label, amountCents: l.unitPriceCents })),
        subtotalCents: quote.subtotalCents,
        addonsCents: quote.addonsCents,
        totalCents: quote.totalCents,
        depositCents: depositFor(quote.totalCents, v.depositPercent),
        note: v.note,
        deliveryDays: invite.service.deliveryDays,
        revisionsIncluded: invite.service.revisionsIncluded,
        tosSnapshot: invite.page.tos,
        expiresAt: invite.expiresAt,
        createdAt: now,
      }),
      /**
       * ราคาเปลี่ยนแล้ว คำขอที่กดไว้กับฉบับเก่าต้องตายไปด้วย
       *
       * ไม่งั้นครีเอเตอร์จะกดยืนยันคำขอที่ผูกกับราคาเก่าได้ ทั้งที่ตั้งใจขึ้นราคาไปแล้ว
       * และลูกค้าก็ไม่เคยเห็นฉบับใหม่ — ให้กดรับใหม่ดีกว่าเดาแทนกันทั้งสองฝ่าย
       */
      db
        .update(schema.orderInviteClaim)
        .set({ rejectedAt: now })
        .where(
          and(
            eq(schema.orderInviteClaim.inviteId, invite.id),
            isNull(schema.orderInviteClaim.rejectedAt),
            isNull(schema.orderInviteClaim.withdrawnAt),
          ),
        ),
    ]);
  } catch (err) {
    // ยิงพร้อมกันสองครั้งแล้วชน index — ตอบว่าชนกัน ไม่ใช่ปล่อยเป็น 500
    if (String(err).includes("order_invite_revision_live_idx")) {
      return { ok: false, error: "conflict" };
    }
    throw err;
  }

  revalidatePath("/invites");
  return { ok: true };
}

/* ── เพิกถอนลิงก์ ─────────────────────────────────────────────────── */

export type RevokeResult =
  | { ok: true }
  | { ok: false; error: "unauthenticated" | "invalid" | "not_found" | "closed" };

/**
 * เพิกถอนลิงก์ที่ส่งผิดคน
 *
 * ⚠️ **ต้องปฏิเสธคำขอที่กดค้างไว้ด้วย ไม่ใช่แค่ปิดลิงก์**
 *
 * ถ้าปิดแค่ลิงก์ คนที่กดรับไปก่อนหน้านั้นเสี้ยววินาทีจะยังค้างอยู่บนบอร์ดพร้อมปุ่มยืนยัน
 * แล้วการกดยืนยันนั่นแหละที่สร้างการผูกถาวรซึ่งฟีเจอร์นี้ออกแบบมาเพื่อป้องกัน —
 * ปุ่มเพิกถอนที่ไม่ได้เอาคนผิดออกไปคือปุ่มที่ไม่ได้เพิกถอนอะไรเลย
 */
export async function revokeInvite(inviteId: string): Promise<RevokeResult> {
  const { user } = await requireCreator();
  if (!inviteId || inviteId.length > 64) return { ok: false, error: "invalid" };

  const db = getDb();
  const invite = await db.query.orderInvite.findFirst({
    where: eq(schema.orderInvite.id, inviteId),
    with: { page: { columns: { userId: true } } },
  });
  if (!invite || invite.page.userId !== user.id) return { ok: false, error: "not_found" };
  // กลายเป็นออเดอร์ไปแล้วก็เพิกถอนไม่ได้ — ต้องไปยกเลิกที่ออเดอร์แทน
  if (invite.confirmedAt) return { ok: false, error: "closed" };

  const now = new Date();
  await db.batch([
    db
      .update(schema.orderInvite)
      .set({ revokedAt: now })
      .where(and(eq(schema.orderInvite.id, inviteId), isNull(schema.orderInvite.revokedAt))),
    db
      .update(schema.orderInviteClaim)
      .set({ rejectedAt: now })
      .where(
        and(
          eq(schema.orderInviteClaim.inviteId, inviteId),
          isNull(schema.orderInviteClaim.rejectedAt),
          isNull(schema.orderInviteClaim.withdrawnAt),
        ),
      ),
  ]);

  revalidatePath("/invites");
  return { ok: true };
}
