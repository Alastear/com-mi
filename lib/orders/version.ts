/**
 * "รุ่น" ของออเดอร์ที่หน้าจอวาดอยู่ = `order.updatedAt` เป็นมิลลิวินาที
 *
 * ใช้คู่กับ `from` ใน `transitionOrder` — สถานะอย่างเดียวจับแท็บค้างไม่ได้เมื่อออเดอร์วนกลับมา
 * สถานะเดิม (in_review รอบ 1 → ทำต่อ → in_review รอบ 2 โดยครีเอเตอร์คนเดียว) ส่วน `updatedAt`
 * ขยับทุกครั้งที่สถานะหรือยอดเงินเปลี่ยน (ดู lib/orders/lifecycle.ts) จึงบอกได้ว่าเป็นคนละรอบ
 * ไม่ต้องเพิ่มคอลัมน์ใหม่
 *
 * ⚠️ เทียบที่ความละเอียด **มิลลิวินาที** เสมอ ห้ามเทียบ timestamptz ตรง ๆ
 * Postgres เก็บถึงไมโครวินาที (แถวที่เขียนด้วย `now()`/`defaultNow()` มีเศษ) แต่ `Date` ของ JS
 * ตัดเหลือมิลลิวินาทีตอนอ่าน — ฝั่ง SQL จึงต้อง `date_trunc('milliseconds', updated_at)` ให้ตรงกัน
 * ไม่งั้นออเดอร์ที่ `updated_at` มีเศษจะขึ้น "ข้อมูลเก่า" ทุกครั้งที่กด และกดอะไรไม่ได้อีกเลย
 * (lib/orders/lifecycle-run.ts เจอปัญหาเดียวกันและแก้ด้วยค่าดิบ `::text`)
 */
export function orderVersion(updatedAt: Date): number {
  return updatedAt.getTime();
}

/** รุ่นเป็นข้อความ ISO สำหรับใส่ใน SQL (`::timestamptz`) — แม่นถึงมิลลิวินาทีพอดี ไม่ผ่าน float */
export function versionIso(version: number): string {
  return new Date(version).toISOString();
}
