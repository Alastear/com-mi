import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { effectivePlan, PLANS, type PlanId } from "@/lib/billing/plans";
import type { Bucket } from "@/lib/storage/r2";

/**
 * อายุของคำขออัปโหลด — นับจากตอนอนุมัติถึงตอนบันทึกลง `media`
 *
 * รูปอัปเสร็จในไม่กี่วินาที ชั่วโมงเดียวเหลือเฟือ ส่วนไฟล์ส่งมอบ 2 GB บนเน็ตมือถือ
 * ใช้เวลาหลายชั่วโมงได้ จึงยาวเท่ากับอายุ URL ของชิ้นส่วน (lib/storage/r2.ts)
 */
export const MEDIA_INTENT_TTL_MS = 60 * 60 * 1000;
export const DELIVERY_INTENT_TTL_MS = 6 * 60 * 60 * 1000;

export type UploadIntent = typeof schema.uploadIntent.$inferSelect;

export function planLimits(plan: string | null | undefined) {
  return (PLANS[effectivePlan((plan ?? "free") as PlanId)] ?? PLANS.free).limits;
}

/** พื้นที่ที่ใช้ไปแล้ว — รวมจากแถวใน `media` (ถูกและเร็วกว่าไล่นับไฟล์ในถัง) */
export async function storageUsed(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<string>`coalesce(sum(${schema.media.bytes}), 0)` })
    .from(schema.media)
    .where(eq(schema.media.ownerUserId, userId));
  return Number(row?.total ?? 0);
}

/**
 * ใช้คำขออัปโหลดหนึ่งครั้ง — คืนแถวเมื่อเป็นของคนนี้ อยู่ถังที่ถูก ยังไม่หมดอายุ และยังไม่ถูกใช้
 *
 * ⚠️ เป็น compare-and-set ในคำสั่งเดียว: กดบันทึกซ้ำสองครั้งพร้อมกัน มีครั้งเดียวที่ได้แถวคืน
 * ถ้าอ่านก่อนแล้วค่อยเขียน ทั้งสองครั้งจะผ่าน แล้วได้แถว `media` สองแถวชี้ไฟล์เดียวกัน
 * (โควตานับซ้ำ และลบแถวหนึ่งเมื่อไรไฟล์ของอีกแถวก็หายไปด้วย)
 *
 * ถูกใช้ไปแล้วแต่บันทึกไม่สำเร็จ (ไฟล์ไม่ขึ้น, R2 ล่ม) = ผู้ใช้ต้องอัปใหม่
 * ไฟล์ที่ค้างอยู่ งานเก็บกวาดตามลบให้ เพราะไม่มีแถว `media` ไหนชี้ถึง key นั้น
 */
export async function claimIntent(
  id: string,
  userId: string,
  bucket: Bucket,
): Promise<UploadIntent | null> {
  const [row] = await getDb()
    .update(schema.uploadIntent)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(schema.uploadIntent.id, id),
        eq(schema.uploadIntent.userId, userId),
        eq(schema.uploadIntent.bucket, bucket),
        isNull(schema.uploadIntent.consumedAt),
        gt(schema.uploadIntent.expiresAt, sql`now()`),
      ),
    )
    .returning();
  return row ?? null;
}
