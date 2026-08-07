"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { isOrderCode } from "./code";
import { assertTransition, TransitionError, type Actor } from "./state-machine";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

/**
 * เปลี่ยนสถานะออเดอร์ — ทางเดียวที่ได้รับอนุญาตให้เขียน `order.status`
 *
 * อยู่ใน lib/ ไม่ใช่ colocate กับหน้า เพราะถูกเรียกจากทั้งฝั่งครีเอเตอร์ `(app)`
 * และฝั่งลูกค้า `(public)` (แบบเดียวกับ lib/media/actions.ts)
 *
 * ⚠️ **actor มาจาก session เท่านั้น ห้ามรับจาก client**
 * ถ้าให้ client บอกว่าตัวเองเป็นใคร ลูกค้าจะส่ง actor:"creator" มาแล้วกดอนุมัติงานตัวเองได้
 */

const Schema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  to: z.enum(ORDER_STATUSES),
});

export type TransitionResult =
  | { ok: true; status: OrderStatus }
  | {
      ok: false;
      error: "unauthenticated" | "not_found" | "invalid" | "not_allowed" | "wrong_actor" | "stale";
    };

export async function transitionOrder(input: {
  code: string;
  to: OrderStatus;
}): Promise<TransitionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { code, to } = parsed.data;

  const db = getDb();

  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true, status: true, clientUserId: true, creatorPageId: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order) return { ok: false, error: "not_found" };

  // หาบทบาทจาก session ล้วน ๆ — ไม่มีทางที่ client จะแทรกแซงได้
  const actor: Actor | null =
    order.page.userId === session.user.id
      ? "creator"
      : order.clientUserId === session.user.id
        ? "client"
        : null;
  // ไม่เกี่ยวข้องกับออเดอร์นี้ = ตอบเหมือนไม่มีอยู่จริง ไม่บอกว่ามีแต่เข้าไม่ได้
  if (!actor) return { ok: false, error: "not_found" };

  const from = order.status as OrderStatus;
  try {
    assertTransition(from, to, actor);
  } catch (err) {
    if (err instanceof TransitionError) return { ok: false, error: err.reason };
    throw err;
  }

  const now = new Date();

  /**
   * เขียนแบบ compare-and-set — `where` มี status เดิมด้วย
   *
   * ถ้าครีเอเตอร์เปิดบอร์ดไว้สองแท็บแล้วกดจากทั้งคู่ อันที่สองต้องไม่ทับ
   * เพราะสถานะที่มันเห็นตอนกดไม่ใช่สถานะจริงแล้ว — ตรวจตอนอ่านอย่างเดียวไม่พอ
   * ระหว่างอ่านกับเขียนมีช่องให้แทรกเสมอ
   */
  const updated = await db
    .update(schema.order)
    .set({
      status: to,
      updatedAt: now,
      ...(to === "completed" ? { completedAt: now } : null),
    })
    .where(and(eq(schema.order.id, order.id), eq(schema.order.status, from)))
    .returning({ id: schema.order.id });

  if (updated.length === 0) return { ok: false, error: "stale" };

  /**
   * บันทึกลง timeline เป็น event ไม่ใช่ข้อความสำเร็จรูป
   * เก็บเป็น key + ข้อมูล แล้วค่อยแปลตอนแสดง — ถ้าเก็บเป็นข้อความไทย
   * ลูกค้าที่ใช้ภาษาอังกฤษจะเห็นไทยปนตลอดไป และแก้ย้อนหลังไม่ได้
   */
  await db.insert(schema.message).values({
    id: newId("msg"),
    orderId: order.id,
    senderUserId: session.user.id,
    isSystemEvent: true,
    eventType: "status_changed",
    eventData: { from, to, actor },
    createdAt: now,
  });

  revalidatePath("/orders");
  revalidatePath("/dashboard");

  return { ok: true, status: to };
}
