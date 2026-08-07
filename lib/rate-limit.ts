import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Rate limit บน Postgres — ไม่เพิ่ม Redis (docs/01 §สิ่งที่ตั้งใจไม่ใส่)
 *
 * ปริมาณ write ต่ำมาก เพราะเรียกเฉพาะตอน submit ฟอร์มที่สร้างของจริง
 * ไม่ได้เอาไปครอบทุก request — ถ้าทำแบบนั้นถึงจะคุ้มกับ Redis
 *
 * ทำเป็น fixed window ไม่ใช่ sliding window: แถวเดียวต่อ key, อัปเดตในคำสั่งเดียว,
 * ไม่มี race ระหว่างอ่านกับเขียน แลกกับความแม่นยำที่ขอบหน้าต่าง
 * ซึ่งไม่สำคัญเลยสำหรับงานกันสแปม
 */

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** วินาทีที่ต้องรอจนกว่าหน้าต่างจะรีเซ็ต */
  retryAfterSeconds: number;
};

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const db = getDb();

  /**
   * ทั้งหมดอยู่ในคำสั่งเดียว — อ่านแล้วค่อยเขียนจะมีช่องให้ยิงพร้อมกันทะลุลิมิต
   *
   * ON CONFLICT ตัดสินจาก window_start ที่มีอยู่:
   *   หน้าต่างหมดอายุแล้ว → เริ่มนับใหม่ที่ 1 พร้อมขยับ window_start
   *   ยังอยู่ในหน้าต่าง    → +1
   * `now()` ของ Postgres เป็นตัวตัดสินเวลา ไม่ใช่นาฬิกาของเครื่องที่รันโค้ด
   */
  const rows = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into ${schema.rateLimit} (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case
        when ${schema.rateLimit.windowStart} < now() - make_interval(secs => ${windowSeconds})
        then 1
        else ${schema.rateLimit.count} + 1
      end,
      window_start = case
        when ${schema.rateLimit.windowStart} < now() - make_interval(secs => ${windowSeconds})
        then now()
        else ${schema.rateLimit.windowStart}
      end
    returning count, window_start
  `);

  const row = rows.rows?.[0] ?? (rows as unknown as { count: number; window_start: string }[])[0];
  const count = Number(row?.count ?? 1);
  const windowStart = new Date(row?.window_start ?? Date.now());
  const elapsed = (Date.now() - windowStart.getTime()) / 1000;

  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(0, Math.ceil(windowSeconds - elapsed)),
  };
}

/** ลิมิตที่ใช้จริง — รวมไว้ที่เดียวจะได้เห็นภาพรวมและปรับพร้อมกันได้ */
export const LIMITS = {
  /** ส่งคำขอสั่งงาน: 5 ครั้งต่อชั่วโมงต่อผู้ใช้ */
  createOrder: { limit: 5, windowSeconds: 3600 },
  /** ส่งข้อความในเธรด: 30 ครั้งต่อ 5 นาที */
  sendMessage: { limit: 30, windowSeconds: 300 },
} as const;
