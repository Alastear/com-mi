import "server-only";

import { and, eq, gt, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { effectivePlan, PLANS, type PlanId } from "@/lib/billing/plans";
import { PART_URL_TTL_SECONDS } from "@/lib/storage/keys";
import type { Bucket } from "@/lib/storage/r2";

/**
 * อายุของคำขออัปโหลด — นับจากตอนอนุมัติถึงตอนบันทึกลง `media`
 *
 * รูปอัปเสร็จในไม่กี่วินาที ชั่วโมงเดียวเหลือเฟือ (URL อัปรูปอายุ 10 นาที)
 *
 * ไฟล์ส่งมอบ: อายุ URL ของชิ้น **บวกอีกหนึ่งชั่วโมง**
 * ⚠️ ห้ามเท่ากับอายุ URL — R2 ตรวจอายุตอน "เริ่ม" ส่งชิ้น แต่คำขอถูกตรวจตอนบันทึก
 * ซึ่งเกิดหลังชิ้นสุดท้ายส่งเสร็จ ชิ้นที่เริ่มนาทีสุดท้ายแล้วเสร็จเลยเวลาไปจะผ่าน R2
 * แต่บันทึกไม่ได้ ไฟล์ 2 GB ที่อัปมาหกชั่วโมงหายทั้งไฟล์
 */
export const MEDIA_INTENT_TTL_MS = 60 * 60 * 1000;
export const DELIVERY_INTENT_TTL_MS = PART_URL_TTL_SECONDS * 1000 + 60 * 60 * 1000;

export type UploadIntent = typeof schema.uploadIntent.$inferSelect;

export function planLimits(plan: string | null | undefined) {
  return (PLANS[effectivePlan((plan ?? "free") as PlanId)] ?? PLANS.free).limits;
}

/**
 * พื้นที่ที่ใช้ไปแล้วในรูป SQL — ไฟล์ที่บันทึกแล้ว **รวมกับคำขอที่อนุมัติไปแล้วแต่ยังไม่บันทึก**
 *
 * ⚠️ ต้องนับคำขอที่ค้างด้วย ไม่งั้นโควตาเป็นแค่ตัวเลขประดับ: เดิมนับเฉพาะ `media`
 * ขอ URL ไฟล์ส่งมอบ 2000 MB ซ้ำได้ 40 ครั้งต่อชั่วโมง ทุกครั้งเห็นพื้นที่ว่างเท่าเดิม
 * อัปทุกชิ้นแต่ไม่กดบันทึก ไบต์ก็ค้างอยู่ในถังส่วนตัวเป็นร้อย GB โดยไม่ติดโควตาเลย
 * (ค่าเก็บเราจ่าย) — ตอนนี้คำขอที่ยังไม่หมดอายุ "จอง" พื้นที่ไว้จนกว่าจะบันทึก ยกเลิก หรือหมดอายุ
 *
 * คำขอที่ถูกใช้แล้ว (`consumed_at`) ไม่นับ — ถ้าบันทึกสำเร็จ ไบต์ไปอยู่ใน `media` แล้ว
 * ถ้าไม่สำเร็จ ไฟล์ถูกลบหรือรองานเก็บกวาด
 */
export function usedBytesSql(userId: string): SQL {
  return sql`(
    (select coalesce(sum(m.bytes), 0) from media m where m.owner_user_id = ${userId})
    + (select coalesce(sum(i.bytes), 0) from upload_intent i
       where i.user_id = ${userId} and i.consumed_at is null and i.expires_at > now())
  )::bigint`;
}

/** เงื่อนไข "ใส่อีก `bytes` แล้วยังไม่เกินโควตา" — ใช้ใน WHERE ของ insert แบบมีเงื่อนไข */
export function withinQuotaSql(userId: string, bytes: number, limit: number): SQL {
  return sql`${usedBytesSql(userId)} + ${bytes}::bigint <= ${limit}::bigint`;
}

/**
 * ล็อกโควตาของผู้ใช้คนนี้ไว้จนจบ batch — วางก่อนคำสั่งที่เพิ่มไบต์ (insert คำขอหรือ media)
 *
 * ⚠️ insert แบบมีเงื่อนไขเฉย ๆ ไม่พอ: ใน READ COMMITTED สองคำสั่งที่วิ่งพร้อมกันต่างเห็นยอด
 * ก่อนอีกฝั่ง commit แล้วผ่านทั้งคู่ (สองแท็บ หรือสคริปต์ยิง action ตรง ๆ) ได้ N เท่าของโควตา
 * advisory lock ทำให้คำสั่งถัดไปใน batch ถ่าย snapshot หลังอีกฝั่ง commit แล้ว
 * (เหตุผลเดียวกับ `lockOrder` — lib/orders/lock.ts)
 *
 * ใช้ advisory lock ไม่ใช่ล็อกแถว `user` — แถวนั้น Better Auth เขียนอยู่เรื่อย ๆ ไม่ควรไปขวาง
 * ลำดับ: batch ที่ล็อกออเดอร์ด้วยต้องล็อกออเดอร์ก่อนเสมอ (ตามกติกาใน lock.ts)
 */
export function lockStorage(userId: string) {
  return getDb().execute(sql`select pg_advisory_xact_lock(hashtextextended(${`storage:${userId}`}, 0))`);
}

/** จำนวนแถวที่คำสั่ง raw ใน batch เขียนไป — ผลของ neon-http มีได้ทั้ง rows และ rowCount */
export function affectedRows(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const r = result as { rowCount?: number | null; rows?: unknown[] };
  return r.rowCount ?? r.rows?.length ?? 0;
}

/**
 * ใช้คำขออัปโหลดหนึ่งครั้ง — คืนแถวเมื่อเป็นของคนนี้ อยู่ถังที่ถูก ยังไม่หมดอายุ และยังไม่ถูกใช้
 *
 * ⚠️ เป็น compare-and-set ในคำสั่งเดียว: กดบันทึกซ้ำสองครั้งพร้อมกัน มีครั้งเดียวที่ได้แถวคืน
 * ถ้าอ่านก่อนแล้วค่อยเขียน ทั้งสองครั้งจะผ่าน แล้วได้แถว `media` สองแถวชี้ไฟล์เดียวกัน
 * (โควตานับซ้ำ และลบแถวหนึ่งเมื่อไรไฟล์ของอีกแถวก็หายไปด้วย)
 *
 * บันทึกล้มเพราะเรื่องชั่วคราว (R2/Neon สะดุด) ผู้เรียกคืนสิทธิ์ด้วย `releaseIntent` ได้
 * ส่วนที่ล้มถาวร (ไฟล์ไม่ขึ้น ขนาดไม่ตรง) = ผู้ใช้ต้องอัปใหม่
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

/**
 * คืนสิทธิ์คำขอที่ `claimIntent` ใช้ไปแล้ว — เมื่อบันทึกล้มเพราะเรื่องชั่วคราว ให้ลองบันทึกใหม่ได้
 * โดยไม่ต้องอัปไฟล์ 2 GB ซ้ำ
 *
 * ⚠️ ปลอดภัยแม้ insert `media` อาจ commit ไปแล้ว (เน็ตหลุดตอนรอคำตอบ) เพราะ insert
 * ใน `registerDeliveryFile` มีเงื่อนไข "ยังไม่มีแถวไหนชี้ key นี้" — ลองซ้ำจะได้แถวเดิมคืน
 * ไม่ใช่แถวที่สอง และงานเก็บกวาดดูแถว `media` ก่อนลบไฟล์เสมอ
 */
export async function releaseIntent(id: string, userId: string): Promise<void> {
  await getDb()
    .update(schema.uploadIntent)
    .set({ consumedAt: null })
    .where(
      and(
        eq(schema.uploadIntent.id, id),
        eq(schema.uploadIntent.userId, userId),
        isNotNull(schema.uploadIntent.consumedAt),
        gt(schema.uploadIntent.expiresAt, sql`now()`),
      ),
    );
}

/**
 * แถว `media` ที่บันทึกจากคำขอนี้ไปแล้ว — สำหรับการกดบันทึกซ้ำหลังคำตอบรอบแรกหายกลางทาง
 * (บันทึกสำเร็จแล้วแต่เบราว์เซอร์ไม่รู้) ตอบ id เดิมแทนที่จะบอกว่า "ไม่มีสิทธิ์"
 */
export async function registeredMediaId(intentId: string, userId: string): Promise<string | null> {
  const res = await getDb().execute<{ id: string }>(sql`
    select m.id from upload_intent i
    join media m on m.pathname = i.key and m.owner_user_id = i.user_id
    where i.id = ${intentId} and i.user_id = ${userId}
    limit 1
  `);
  const row = res.rows?.[0] ?? (res as unknown as { id: string }[])[0];
  return row?.id ?? null;
}
