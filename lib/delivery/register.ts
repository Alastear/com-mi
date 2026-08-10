"use server";

import { and, eq, sql } from "drizzle-orm";
import { del, head } from "@vercel/blob";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { getSession } from "@/lib/auth-guard";
import { privateBlobToken } from "@/lib/blob/stores";
import { isOrderCode } from "@/lib/orders/code";
import { isDeliveryPath } from "./path";
import { effectivePlan, PLANS, type PlanId } from "@/lib/billing/plans";

/**
 * บันทึกไฟล์ส่งมอบที่เพิ่งอัปโหลดลงตาราง media
 *
 * ⚠️ **ไม่ใช่การต่อยอด `registerMedia`** ตัวนั้นเช็คแค่ `requireCreator()`
 * ซึ่งพิสูจน์แค่ว่า "คนนี้ตั้ง handle แล้ว" ไม่ได้พิสูจน์ว่าเป็นเจ้าของออเดอร์ใบนี้
 * ไฟล์ที่กั้นเงินอยู่ต้องผูกกับออเดอร์ตั้งแต่วินาทีที่บันทึก ไม่ใช่ผูกทีหลัง
 *
 * ⚠️ **โควตาตรวจหลังอัปโหลด ไม่ใช่ก่อน** — `maximumSizeInBytes` บังคับไม่ได้จริง
 * กับ multipart (ทดสอบแล้ว: ตั้งเพดาน 1 MiB แล้วอัป 6 MiB ผ่าน)
 * ตอนถึงตรงนี้ไบต์ถูกเขียนไปแล้ว ทางเดียวคืออ่านขนาดจริงแล้วลบทิ้งถ้าเกิน
 */

const Schema = z.object({
  code: z.string().refine(isOrderCode, "bad_code"),
  url: z.url(),
  pathname: z.string().min(1).max(400),
  filename: z.string().trim().max(200),
});

export type RegisterDeliveryResult =
  | { ok: true; mediaId: string }
  | { ok: false; error: "forbidden" | "invalid" | "storage_quota_exceeded" };

export async function registerDeliveryFile(
  input: z.input<typeof Schema>,
): Promise<RegisterDeliveryResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "forbidden" };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, v.code),
    columns: { id: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order || order.page.userId !== session.user.id) return { ok: false, error: "forbidden" };

  // ตรวจ prefix ซ้ำอีกรอบกับออเดอร์ที่หาเอง ไม่ใช่เชื่อค่าที่ส่งมาคู่กัน
  // กฎอยู่ที่ lib/delivery/path.ts จุดเดียว — เคยเขียนแยกกันแล้วเพี้ยนมาแล้ว
  if (!isDeliveryPath(v.pathname, v.code)) return { ok: false, error: "forbidden" };

  // ขนาดจริงต้องอ่านจาก store ส่วนตัว — head() ที่ไม่มี token จะเข้าไม่ถึงไฟล์นี้
  const meta = await head(v.url, { token: privateBlobToken() });

  const plan = effectivePlan((session.user.plan ?? "free") as PlanId);
  const limit = (PLANS[plan] ?? PLANS.free).limits.storage_bytes;
  const [used] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.media.bytes}), 0)` })
    .from(schema.media)
    .where(eq(schema.media.ownerUserId, session.user.id));

  if (Number(used?.total ?? 0) + meta.size > limit) {
    // ไบต์ถูกเขียนไปแล้ว ต้องเก็บกวาดเอง ไม่งั้นเหลือไฟล์ค้างที่ไม่มีแถวชี้ถึง
    await del(v.url, { token: privateBlobToken() });
    return { ok: false, error: "storage_quota_exceeded" };
  }

  const mediaId = newId("med");
  await db.insert(schema.media).values({
    id: mediaId,
    ownerUserId: session.user.id,
    orderId: order.id,
    pathname: v.pathname,
    url: v.url,
    access: "private",
    kind: "final",
    contentType: meta.contentType ?? "application/octet-stream",
    bytes: meta.size,
    filename: v.filename.slice(0, 200),
    // ไม่คำนวณ thumbhash ให้ไฟล์ส่งมอบ — ภาพย่อของงานที่ยังไม่จ่ายก็คือการรั่ว
    status: "orphan",
  });

  return { ok: true, mediaId };
}

/** ไฟล์ส่งมอบของออเดอร์นี้ที่ครีเอเตอร์อัปไว้แล้ว (ยังไม่ผูกกับ delivery) */
export async function listDeliveryFiles(code: string) {
  const session = await getSession();
  if (!session || !isOrderCode(code)) return [];

  const db = getDb();
  const order = await db.query.order.findFirst({
    where: eq(schema.order.code, code),
    columns: { id: true },
    with: { page: { columns: { userId: true } } },
  });
  if (!order || order.page.userId !== session.user.id) return [];

  return db.query.media.findMany({
    where: and(eq(schema.media.orderId, order.id), eq(schema.media.kind, "final")),
    columns: { id: true, filename: true, bytes: true, contentType: true, status: true },
  });
}
