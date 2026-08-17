"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession, requireCreator } from "@/lib/auth-guard";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { quoteFromLines, depositFor } from "./pricing";
import { assertCanAcceptNewOrder, insertNewOrder } from "./new-order";
import { generateInviteToken, isInviteToken } from "./invite-token";
import { notify } from "@/lib/notifications/create";
import { sql } from "drizzle-orm";

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


/* ── ลูกค้ากดรับ ───────────────────────────────────────────────────── */

export type ClaimResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "not_found"
        | "wrong_account"
        | "closed"
        | "superseded"
        | "conflict";
    };

/**
 * ลูกค้ากดรับงาน — **จุดที่การยินยอมเกิดขึ้นจริง**
 *
 * เขียนแค่แถวคำขอ ไม่สร้างออเดอร์ ครีเอเตอร์ต้องกดยืนยันอีกที
 *
 * ⚠️ ต้องส่ง `revisionId` มาด้วยเสมอ ไม่ใช่แค่โทเคน — ระหว่างที่ลูกค้าเปิดหน้าค้างไว้
 * ครีเอเตอร์แก้ราคาได้ ถ้ารับด้วยโทเคนเปล่า ลูกค้าจะผูกกับตัวเลขที่ไม่เคยอ่าน
 *
 * ⚠️ เขียนด้วยคำสั่งเดียวที่มีเงื่อนไขอยู่ในตัว ไม่ใช่ "อ่านก่อนแล้วค่อยเขียน" —
 * neon-http ไม่มี interactive transaction ระหว่างอ่านกับเขียนมีช่องให้ครีเอเตอร์
 * กดเพิกถอนแทรกเข้ามาได้เสมอ แล้วคำขอจะเกิดบนลิงก์ที่ตายไปแล้ว
 */
export async function claimInvite(token: string, revisionId: string): Promise<ClaimResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!isInviteToken(token) || !revisionId || revisionId.length > 64) {
    return { ok: false, error: "invalid" };
  }

  const db = getDb();
  const invite = await db.query.orderInvite.findFirst({
    where: eq(schema.orderInvite.token, token),
    columns: { id: true, email: true, revokedAt: true, confirmedAt: true, expiresAt: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!invite) return { ok: false, error: "not_found" };

  /**
   * อีเมลไม่ตรง = ปฏิเสธ **และไม่เผาใบทิ้ง**
   *
   * ลูกค้าตัวจริงอาจกดจากบัญชีผิดโดยไม่ตั้งใจ ถ้าเผาใบตรงนี้เขาจะเข้าไม่ได้อีกเลย
   * และครีเอเตอร์ต้องออกใบใหม่โดยไม่รู้ว่าเกิดอะไรขึ้น — บอกให้สลับบัญชีพอ
   */
  if ((session.user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
    return { ok: false, error: "wrong_account" };
  }
  if (invite.revokedAt || invite.confirmedAt) return { ok: false, error: "closed" };
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "closed" };
  }

  const claimId = newId("iclm");
  try {
    /**
     * เงื่อนไขทั้งหมดอยู่ใน `where` ของคำสั่งเขียนเอง — ศูนย์แถวคือคำตอบว่า "ไม่ผ่าน"
     * ฉบับต้องยังเปิดอยู่ และใบต้องยังไม่ถูกเพิกถอน/ยืนยัน/หมดอายุ ณ วินาทีที่เขียน
     */
    const rows = await db.execute(sql`
      insert into order_invite_claim (id, invite_id, revision_id, user_id)
      select ${claimId}, ${invite.id}, ${revisionId}, ${session.user.id}
      where exists (
        select 1 from order_invite_revision r
        where r.id = ${revisionId} and r.invite_id = ${invite.id}
          and r.superseded_at is null and r.accepted_at is null
      )
      and exists (
        select 1 from order_invite i
        where i.id = ${invite.id} and i.revoked_at is null and i.confirmed_at is null
          and (i.expires_at is null or i.expires_at > now())
      )
      returning id
    `);
    const inserted = Array.isArray(rows) ? rows.length : (rows.rows?.length ?? 0);
    if (inserted === 0) return { ok: false, error: "superseded" };
  } catch (err) {
    // มีคนกดรับใบนี้ค้างอยู่แล้ว — index บังคับว่าเปิดค้างได้คำขอเดียวต่อใบ
    if (String(err).includes("order_invite_claim_live_idx")) {
      return { ok: false, error: "conflict" };
    }
    throw err;
  }

  await notify({
    userId: invite.page.userId,
    actorUserId: session.user.id,
    type: "invite_claimed",
    data: {},
    url: "/invites",
    entityType: "invite",
    entityId: invite.id,
  });

  revalidatePath("/invites");
  return { ok: true };
}


/* ── ครีเอเตอร์ยืนยัน — ออเดอร์เกิดตรงนี้ ─────────────────────────── */

export type ConfirmResult =
  | { ok: true; code: string }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid"
        | "not_found"
        | "closed"
        | "shop_closed"
        | "own_shop"
        | "creator_full";
    };

/**
 * ครีเอเตอร์กดยืนยันคำขอ — **ที่เดียวที่ใบเชิญกลายเป็นออเดอร์**
 *
 * ⚠️ ด่านทุกข้อถูกตรวจ **ที่นี่** ไม่ใช่ตอนออกใบ ระหว่างสองจังหวะนั้นเวลาผ่านไปเป็นวันได้
 * ร้านอาจถูกระงับ ปิดรับงาน โควตาเต็ม หรือบริการถูกลบไปแล้ว
 *
 * ⚠️ เขียน `confirmedAt` แบบ compare-and-set ก่อนทำอย่างอื่น — ศูนย์แถวคือ
 * "มีคนยืนยันไปแล้ว" หรือ "ใบตายไปแล้ว" ถ้าเช็คด้วยการอ่านเฉย ๆ สองแท็บกดพร้อมกัน
 * จะได้ออเดอร์สองใบจากใบเชิญเดียว
 */
export async function confirmInviteClaim(claimId: string): Promise<ConfirmResult> {
  const { user } = await requireCreator();
  if (!claimId || claimId.length > 64) return { ok: false, error: "invalid" };

  const db = getDb();
  const claim = await db.query.orderInviteClaim.findFirst({
    where: eq(schema.orderInviteClaim.id, claimId),
    with: {
      revision: true,
      user: { columns: { id: true, email: true } },
      invite: { with: { page: { columns: { id: true, userId: true, isPublished: true, suspendedAt: true, status: true } } } },
    },
  });
  if (!claim || claim.invite.page.userId !== user.id) return { ok: false, error: "not_found" };
  if (claim.rejectedAt || claim.withdrawnAt) return { ok: false, error: "closed" };
  if (claim.revision.supersededAt || claim.revision.acceptedAt) {
    return { ok: false, error: "closed" };
  }

  /**
   * บริการต้องยังเปิดอยู่ ณ ตอนนี้ — อ่านซ้ำด้วยตัวกรองเดียวกับ `createOrder`
   * ใบเชิญเก็บแค่ `serviceId` ไว้ ระหว่างทางครีเอเตอร์ปิดหรือลบบริการได้
   */
  const service = claim.invite.serviceId
    ? await db.query.service.findFirst({
        where: and(
          eq(schema.service.id, claim.invite.serviceId),
          eq(schema.service.isActive, true),
          isNull(schema.service.deletedAt),
        ),
        columns: { id: true, title: true },
      })
    : null;
  if (!service) return { ok: false, error: "not_found" };

  const owner = await db.query.user.findFirst({
    columns: { id: true, plan: true },
    where: eq(schema.user.id, user.id),
  });
  if (!owner) return { ok: false, error: "not_found" };

  const shopGate = assertCanAcceptNewOrder({
    page: claim.invite.page,
    owner,
    clientUserId: claim.userId,
  });
  if (!shopGate.ok) return { ok: false, error: shopGate.error === "not_found" ? "shop_closed" : shopGate.error };

  const now = new Date();

  // ด่านยืนยันได้ครั้งเดียว — เขียนก่อน ค่อยสร้างออเดอร์
  const claimed = await db
    .update(schema.orderInvite)
    .set({ confirmedAt: now })
    .where(
      and(
        eq(schema.orderInvite.id, claim.inviteId),
        isNull(schema.orderInvite.confirmedAt),
        isNull(schema.orderInvite.revokedAt),
        sql`(${schema.orderInvite.expiresAt} is null or ${schema.orderInvite.expiresAt} > now())`,
      ),
    )
    .returning({ id: schema.orderInvite.id });
  if (claimed.length === 0) return { ok: false, error: "closed" };

  const rev = claim.revision;
  const created = await insertNewOrder({
    page: { id: claim.invite.page.id, tos: rev.tosSnapshot },
    owner,
    service: {
      id: service.id,
      deliveryDays: rev.deliveryDays,
      revisionsIncluded: rev.revisionsIncluded,
    },
    clientUserId: claim.userId,
    actorUserId: user.id,
    quote: {
      subtotalCents: rev.subtotalCents,
      addonsCents: rev.addonsCents,
      totalCents: rev.totalCents,
      depositCents: rev.depositCents,
      lines: rev.lines.map((l) => ({
        label: l.label,
        kind: "custom" as const,
        unitPriceCents: l.amountCents,
        quantity: 1,
        sourceId: null,
      })),
    },
    isPublicInQueue: false,
    eventType: "invite_confirmed",
    /**
     * เวลาที่ **ลูกค้า** กดรับ ไม่ใช่ตอนนี้ — หลักฐานการยินยอมชิ้นเดียวที่มี
     * ต้องชี้ไปที่การกดของลูกค้า ไม่ใช่การกดของครีเอเตอร์ที่เกิดทีหลังเป็นวัน
     */
    acceptedTosAt: claim.claimedAt,
  });

  if (!created.ok) {
    // ปลดล็อกคืนให้ลองใหม่ได้ — ยืนยันไม่สำเร็จต้องไม่ทำให้ใบตายไปเฉย ๆ
    await db
      .update(schema.orderInvite)
      .set({ confirmedAt: null })
      .where(eq(schema.orderInvite.id, claim.inviteId));
    return { ok: false, error: created.error === "creator_full" ? "creator_full" : "not_found" };
  }

  await db.batch([
    /**
     * ครีเอเตอร์เป็นคนร่างราคาและเป็นคนกดยืนยัน — การกดนั้นคือการตอบรับ
     * ปล่อยไว้ที่ `requested` จะบอกลูกค้าว่า "รอครีเอเตอร์ตอบรับ" ทั้งที่เพิ่งตอบรับไปแล้ว
     * และบอร์ดจะเอาไปวางในคอลัมน์คำขอใหม่ให้กดรับสิ่งที่รับไปแล้ว
     *
     * เขียนแบบมีเงื่อนไข — ถ้าพลาด ออเดอร์ค้างที่ `requested` แล้วกดปุ่มปกติต่อได้
     */
    db
      .update(schema.order)
      .set({ status: "accepted", updatedAt: now })
      .where(and(eq(schema.order.id, created.orderId), eq(schema.order.status, "requested"))),
    db
      .update(schema.orderInviteRevision)
      .set({ acceptedAt: now })
      .where(eq(schema.orderInviteRevision.id, rev.id)),
    db
      .update(schema.orderInvite)
      .set({ orderId: created.orderId })
      .where(eq(schema.orderInvite.id, claim.inviteId)),
  ]);

  await notify({
    userId: claim.userId,
    actorUserId: user.id,
    type: "order_created",
    data: { code: created.code, service: service.title },
    url: `/my/requests/${created.code}`,
    entityType: "order",
    entityId: created.orderId,
  });

  revalidatePath("/invites");
  revalidatePath("/orders");
  return { ok: true, code: created.code };
}
