import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * ล็อกแถวออเดอร์ไว้จนจบ batch — วางเป็น **คำสั่งแรก** ของ batch ที่ตัดสินจากเงินหรือสถานะของออเดอร์
 *
 * ใช้ร่วมกันระหว่าง batch เรื่องเงิน (lib/payments/actions.ts) กับ `transitionOrder`
 * ลำดับการล็อกเหมือนกันทุกที่ (ออเดอร์ก่อน แล้วค่อยแถวลูก) จะได้ไม่ deadlock กันเอง
 *
 * ⚠️ ทำไมต้องล็อกก่อน ไม่ใช่ปล่อยให้ UPDATE ล็อกเอง: ใน READ COMMITTED คำสั่ง UPDATE ถ่าย snapshot
 * ตอน **เริ่ม** คำสั่ง แล้วค่อยไปรอ lock ถ้าอีก batch ถือแถวออเดอร์อยู่ พอได้ lock แล้ว Postgres
 * เช็ค WHERE ใหม่เฉพาะเมื่อแถวออเดอร์ **ถูกเขียน** ไปจริง (EvalPlanQual) และเช็คแค่คอลัมน์ของแถวนั้น
 * — subquery ไปตารางอื่น (เช่นนับ payment_record) ยังใช้ snapshot เก่า
 * เคยเกิด: ลูกค้าแจ้งโอน (batch ล็อกออเดอร์ + เพิ่มแถวเงิน แต่ยอดที่ยืนยันแล้วไม่เปลี่ยน แถวออเดอร์
 * จึงไม่ถูกเขียน) ชนกับการยกเลิก — UPDATE ยกเลิกนับแถวเงินจาก snapshot ก่อนแถวใหม่ commit
 * แล้วผ่าน รายการแจ้งโอนค้างบนออเดอร์ที่ยกเลิกแล้วตลอดกาล
 * คำสั่งที่มาหลังการล็อกใน batch เดียวกันถ่าย snapshot หลังได้ lock = เห็นทุกอย่างที่อีกฝั่ง commit แล้ว
 *
 * FOR UPDATE (ไม่ใช่ NO KEY UPDATE) ตามของเดิมของ batch เงิน — batch ที่ใช้ตัวนี้ไม่ได้ถือ lock
 * อื่นก่อนหน้า จึงไม่มีทางวนรอกันเป็นวง ส่วน batch ใบเสนอราคาใช้ NO KEY UPDATE (เหตุผลอยู่ใน quote.ts)
 */
export function lockOrder(orderId: string) {
  return getDb()
    .select({ id: schema.order.id })
    .from(schema.order)
    .where(eq(schema.order.id, orderId))
    .for("update");
}
