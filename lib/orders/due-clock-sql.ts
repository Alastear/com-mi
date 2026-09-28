import { sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";

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

/**
 * event "เริ่มนับวันส่งงาน" พร้อมกำหนดส่งใหม่ — เขียนเฉพาะเมื่อ UPDATE ก่อนหน้าใน batch นี้เพิ่งเริ่มนาฬิกา
 *
 * ตอบรับงานไม่มีมัดจำเลื่อน `due_at` เงียบ ๆ ทั้งที่ทางมัดจำ (`insertDepositMetEvent`) เก็บกำหนดส่งใหม่
 * ลงเธรดเสมอ — เธรดคือหลักฐานของทั้งสองฝ่ายว่านาฬิกาเริ่มเมื่อไร ลูกค้าที่สั่งงาน 7 วันแล้วครีเอเตอร์
 * ตอบรับวันที่ 5 ต้องชี้ได้ว่ากำหนดส่งกลายเป็นวันที่ 12 ตั้งแต่ตอนไหน ไม่ใช่เห็นวันที่ขยับเฉย ๆ
 *
 * ⚠️ ต้องวางหลัง UPDATE ที่ใส่ `startClockOnAcceptSet(at)` **ใน batch เดียวกัน** (อ่านค่าที่มันเพิ่งเขียน)
 * ด่าน "เพิ่งเริ่มตรงนี้" = `deposit_met_at` เท่ากับจุดเริ่มที่ `at` นี้คำนวณได้ (`greatest()` ตัวเดียวกับ
 * ตัวช่วยข้างบน — ทางใบเชิญ `at` มาก่อนออเดอร์เกิด) + ไม่มีมัดจำ + `accepted` แล้ว
 * UPDATE แพ้ compare-and-set / ออเดอร์มีมัดจำ / เคยเริ่มไปแล้ว = ไม่มีแถวให้ select ไม่มี event
 * สอง request ที่ได้ `at` มิลลิวินาทีเดียวกันพอดีจะได้ event ซ้ำแถวเดียว — ข้อจำกัดเดียวกับ `insertEventIf`
 * ไม่มีกำหนดส่ง (`due_at` ว่าง) = ไม่มีนาฬิกาให้เริ่ม ไม่เขียน
 * ไม่มีคนกด (ระบบเลื่อนให้เอง) จึงไม่มี sender และ actor เป็น system — แบบเดียวกับ `deposit_met`
 */
export function insertClockStartedEvent(orderId: string, at: Date) {
  const iso = at.toISOString();
  return getDb().execute(sql`
    insert into message (id, order_id, sender_user_id, is_system_event, event_type, event_data, created_at)
    select ${newId("msg")}::text, o.id, null, true, 'due_started'::text,
           jsonb_build_object('actor', 'system', 'due', o.due_at), o.deposit_met_at
    from "order" o
    where o.id = ${orderId}::text
      and o.status = 'accepted'
      and o.deposit_cents <= 0
      and o.due_at is not null
      and o.deposit_met_at = greatest(${iso}::timestamptz, o.created_at)
  `);
}
