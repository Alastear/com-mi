/**
 * ตรวจว่า error มาจากการชน unique constraint ตัวที่ระบุไหม
 *
 * ⚠️ **ห้ามเช็คด้วย `String(err).includes("<ชื่อ constraint>")`**
 *
 * drizzle-orm ตั้งแต่ 0.44 ห่อ error ของไดรเวอร์ไว้ใน `DrizzleQueryError`
 * ซึ่งข้อความเป็น "Failed query: <SQL>" — ชื่อ constraint ไม่อยู่ในนั้นเลย
 * ข้อมูลจริงอยู่ที่ `err.cause` (`NeonDbError` ที่มี `code` กับ `constraint`)
 *
 * ทดสอบกับฐานข้อมูลจริงแล้ว: ชน primary key แล้ว `String(err)` ไม่มีชื่อ constraint
 * แต่ `err.cause.code === "23505"` และ `err.cause.constraint` ถูกต้อง
 * ผลคือเช็คแบบเดิมทั้ง 4 จุดในโปรเจกต์นี้ไม่เคยตรงเลย: กดพร้อมกันสองครั้งได้ 500
 * แทน `conflict` และการลองสุ่ม `order.code` ใหม่เมื่อชนก็ไม่เคยเกิดขึ้นจริง
 *
 * ไล่ลง `cause` หลายชั้น เพราะไดรเวอร์อื่น (ถ้าวันหนึ่งเปลี่ยน) ห่อต่างกัน
 */
const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(err: unknown, constraint: string): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur && typeof cur === "object"; depth++) {
    const e = cur as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    if (e.code === UNIQUE_VIOLATION) {
      return e.constraint === constraint || e.constraint_name === constraint;
    }
    cur = e.cause;
  }
  return false;
}
