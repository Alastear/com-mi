import { sql, type SQL } from "drizzle-orm";
import { schema } from "@/lib/db";

/**
 * `clockStartsOnAccept()` + `clockStartAt()` + `dueAfterDeposit()` ในรูป SQL — ใส่ใน `.set()`
 * ของ UPDATE ที่ทำให้ออเดอร์เป็น `accepted` (ต้องเป็น UPDATE เดียวกัน ไม่ใช่คำสั่งตามหลัง)
 *
 * ออเดอร์ไม่มีมัดจำ: ตอบรับงาน = เริ่มนับกำหนดส่ง ตั้ง `deposit_met_at` แล้วเลื่อน `due_at`
 * เป็น ตอนนี้ + ระยะงานที่ตกลงไว้ (`due_at − created_at`) — หลักเดียวกับ `recomputePaid` ตอนมัดจำครบ
 * ออเดอร์มีมัดจำ: ไม่แตะอะไร (ทั้งสองคอลัมน์เขียนค่าเดิมกลับ) รอ `recomputePaid` เลื่อนตอนมัดจำครบ
 *
 * ⚠️ อยู่ใน UPDATE เดียวกับ `status = 'accepted'` และ WHERE ของ UPDATE นั้นเป็น compare-and-set
 * บนสถานะเดิมอยู่แล้ว — กดสองแท็บพร้อมกันผ่านได้อันเดียว และ `deposit_met_at is null` คือด่าน
 * "ครั้งเดียว" ชั้นที่สอง แยกเป็นคำสั่งตามหลังไม่ได้: ถ้าตัวหลังล้ม ออเดอร์ accepted โดยกำหนดส่งยังนับ
 * จากตอนสั่ง ซึ่งคือบั๊กที่ไฟล์นี้มีไว้แก้
 *
 * ⚠️ ใน SET ทุกคอลัมน์อ่านค่า **ก่อน** เขียน — ถ้า UPDATE เดียวกันเปลี่ยนมัดจำด้วย (`acceptQuote`)
 * ต้องส่งมัดจำใหม่มาทาง `deposit` ห้ามปล่อยให้อ่าน `deposit_cents` ของแถว (นั่นคือมัดจำก่อนเสนอราคา)
 *
 * @param at เวลาของ request ที่ตอบรับ
 * @param deposit มัดจำหลังการเขียนครั้งนี้ — ไม่ส่ง = มัดจำของแถว (UPDATE ที่ไม่แตะมัดจำ)
 */
export function startClockOnAcceptSet(at: Date, deposit?: number) {
  const o = schema.order;
  const depositAfter: SQL = deposit === undefined ? sql`${o.depositCents}` : sql`${deposit}::int`;
  const starts = sql`(${o.depositMetAt} is null and ${depositAfter} <= 0)`;
  // ไม่ก่อนตอนสร้างออเดอร์ — เหตุผลอยู่ที่ `clockStartAt()`
  const start = sql`greatest(${at.toISOString()}::timestamptz, ${o.createdAt})`;
  return {
    depositMetAt: sql`case when ${starts} then ${start} else ${o.depositMetAt} end`,
    dueAt: sql`case when ${starts} and ${o.dueAt} is not null
      then ${start} + (${o.dueAt} - ${o.createdAt}) else ${o.dueAt} end`,
  };
}
