"use server";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { requireAdmin } from "@/lib/auth-guard";

/**
 * อำนาจของผู้ดูแลแพลตฟอร์ม
 *
 * ⚠️ ทุกฟังก์ชันเรียก `requireAdmin()` เอง ไม่พึ่ง layout —
 * Server Action ไม่ใช่ route ตัว layout จึงไม่ได้รันให้ ใครยิงตรงมาก็ถึงที่นี่เลย
 *
 * ⚠️ ทุกการกระทำเขียน `admin_action` คู่กันเสมอใน `db.batch()` เดียว
 * (neon-http ไม่มี interactive transaction — batch คือทางเดียวที่ทั้งคู่ลงพร้อมกัน)
 * การลงโทษที่ไม่มีบันทึกว่าใครทำเพราะอะไร คือสิ่งที่ย้อนกลับไปหาคำตอบไม่ได้
 */

const Target = z.object({
  id: z.string().min(1).max(64),
  // บังคับให้พิมพ์เหตุผล — ปุ่มที่กดได้โดยไม่ต้องอธิบายคือปุ่มที่จะถูกกดพร่ำเพรื่อ
  reason: z.string().trim().min(3).max(500),
});

export type AdminResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_found" | "has_unreleased_paid_work" };

/* ── ระงับร้าน: เครื่องมือหลัก ไม่กระทบออเดอร์ที่ค้างอยู่ ─────────────── */

/**
 * ระงับร้าน = หยุดรับงานใหม่และหายจากหน้าค้นหา
 *
 * **ไม่แตะ `isPublished` และ `status`** ทั้งสองเป็นค่าที่ครีเอเตอร์ตั้งเอง
 * ถ้าเราไปพลิก เขาพลิกกลับได้ทันที และค่าที่เขาตั้งไว้เดิมก็หายไปเลย
 *
 * ออเดอร์ที่ค้างอยู่เดินต่อได้ตามปกติ — ครีเอเตอร์ยังส่งไฟล์ให้ลูกค้าที่จ่ายแล้วได้
 * นี่คือเหตุผลที่การระงับร้านปลอดภัยพอจะเป็นเครื่องมือแรกที่หยิบใช้
 */
export async function suspendShop(input: z.input<typeof Target>): Promise<AdminResult> {
  const { user: admin } = await requireAdmin();
  const parsed = Target.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { id, reason } = parsed.data;

  const db = getDb();
  const page = await db.query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.id, id),
  });
  if (!page) return { ok: false, error: "not_found" };

  await db.batch([
    db
      .update(schema.creatorPage)
      .set({ suspendedAt: new Date(), suspendedBy: admin.id, suspensionReason: reason })
      .where(eq(schema.creatorPage.id, id)),
    db.insert(schema.adminAction).values({
      id: newId("adm"),
      adminUserId: admin.id,
      action: "suspend_shop",
      targetType: "shop",
      targetId: id,
      reason,
    }),
  ]);

  revalidatePath("/admin");
  return { ok: true };
}

export async function unsuspendShop(input: z.input<typeof Target>): Promise<AdminResult> {
  const { user: admin } = await requireAdmin();
  const parsed = Target.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { id, reason } = parsed.data;

  const db = getDb();
  await db.batch([
    db
      .update(schema.creatorPage)
      .set({ suspendedAt: null, suspendedBy: null, suspensionReason: "" })
      .where(eq(schema.creatorPage.id, id)),
    db.insert(schema.adminAction).values({
      id: newId("adm"),
      adminUserId: admin.id,
      action: "unsuspend_shop",
      targetType: "shop",
      targetId: id,
      reason,
    }),
  ]);

  revalidatePath("/admin");
  return { ok: true };
}

/* ── ระงับบัญชี: หนักกว่า และมีของที่ต้องกันไว้ก่อน ──────────────────── */

/**
 * งานที่ลูกค้าจ่ายครบแล้วแต่ยังไม่ได้รับไฟล์
 *
 * ⚠️ **นี่คือเหตุผลที่การระงับบัญชีต้องมีด่าน** แพลตฟอร์มไม่ได้ถือเงินไว้เลย —
 * ลูกค้าโอนพร้อมเพย์เข้าบัญชีครีเอเตอร์ตรง ๆ ไปแล้ว
 * และ `deliverAndRelease()` เป็นที่เดียวที่เขียน `delivery.releasedAt` ได้
 * โดยบังคับว่าผู้เรียกต้องเป็นครีเอเตอร์เจ้าของออเดอร์
 *
 * ระงับบัญชีตอนที่ยังมีงานแบบนี้ค้างอยู่ = ลูกค้าเสียเงินฟรีโดยไม่มีทางได้อะไรคืน
 * และไม่มีปุ่มไหนในระบบที่จะปล่อยไฟล์แทนเขาได้
 */
async function paidButUndelivered(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.order)
    .innerJoin(schema.creatorPage, eq(schema.creatorPage.id, schema.order.creatorPageId))
    .leftJoin(schema.delivery, eq(schema.delivery.orderId, schema.order.id))
    .where(
      and(
        eq(schema.creatorPage.userId, userId),
        gt(schema.order.totalCents, 0),
        sql`${schema.order.amountPaidCents} >= ${schema.order.totalCents}`,
        isNull(schema.delivery.releasedAt),
      ),
    );
  return row?.n ?? 0;
}

export async function suspendUser(input: z.input<typeof Target>): Promise<AdminResult> {
  const { user: admin } = await requireAdmin();
  const parsed = Target.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { id, reason } = parsed.data;

  const db = getDb();
  const target = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(schema.user.id, id),
  });
  if (!target) return { ok: false, error: "not_found" };

  // ปฏิเสธไปเลยแทนที่จะเตือน — คนกดไม่มีทางรู้ว่ามีลูกค้าค้างอยู่ถ้าเราไม่บอก
  // ทางออกคือระงับ "ร้าน" ก่อน ให้เขาส่งงานที่ค้างจนจบ แล้วค่อยระงับบัญชี
  if ((await paidButUndelivered(id)) > 0) {
    return { ok: false, error: "has_unreleased_paid_work" };
  }

  await db.batch([
    db
      .update(schema.user)
      .set({ suspendedAt: new Date(), suspensionReason: reason, updatedAt: new Date() })
      .where(eq(schema.user.id, id)),
    /**
     * ลบ session ทิ้งด้วย — hook ที่ lib/auth.ts บล็อกแค่ "การสร้าง session ใหม่"
     * คนที่เปิดค้างอยู่จะใช้ต่อได้อีกถึง 30 วันถ้าไม่ลบตรงนี้
     */
    db.delete(schema.session).where(eq(schema.session.userId, id)),
    db.insert(schema.adminAction).values({
      id: newId("adm"),
      adminUserId: admin.id,
      action: "suspend_user",
      targetType: "user",
      targetId: id,
      reason,
    }),
  ]);

  revalidatePath("/admin");
  return { ok: true };
}

export async function unsuspendUser(input: z.input<typeof Target>): Promise<AdminResult> {
  const { user: admin } = await requireAdmin();
  const parsed = Target.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { id, reason } = parsed.data;

  const db = getDb();
  await db.batch([
    db
      .update(schema.user)
      .set({ suspendedAt: null, suspensionReason: "", updatedAt: new Date() })
      .where(eq(schema.user.id, id)),
    db.insert(schema.adminAction).values({
      id: newId("adm"),
      adminUserId: admin.id,
      action: "unsuspend_user",
      targetType: "user",
      targetId: id,
      reason,
    }),
  ]);

  revalidatePath("/admin");
  return { ok: true };
}
