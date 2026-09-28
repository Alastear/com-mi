import type { OrderStatus } from "@/lib/types";
import type { PaymentState } from "@/lib/payments/money";

/**
 * เงินที่ขยับไปแล้วบนออเดอร์ — ใช้เตือนก่อนกดยกเลิก
 *
 *   paidCents    — ยอดที่ครีเอเตอร์ยืนยันแล้ว (ค่าเดียวกับ amount_paid_cents ที่หน้าจอโชว์)
 *   pendingCents — ยอดที่ลูกค้าแจ้งโอนแล้วแต่ยังไม่มีใครตอบ
 *
 * null = ไม่มีเงินเกี่ยวข้องเลย: ยอดที่นับเป็น 0 และไม่เคยมีรายการสักแถว
 *
 * ⚠️ รายการที่ถูกตอบว่า "ยังไม่ได้รับ" หรือถูกยกเลิกการยืนยัน **ยังนับว่ามีเงินเกี่ยวข้อง**
 * ครีเอเตอร์บอกว่าไม่ได้รับ ไม่ได้แปลว่าลูกค้าไม่ได้โอน — สองฝั่งอาจยังเถียงกันอยู่
 * ยกเลิกทั้งที่มีรายการแบบนี้ค้างอยู่ก็ควรได้เห็นคำเตือนเรื่องคืนเงินเหมือนกัน
 */
export type MoneyMoved = { paidCents: number; pendingCents: number; rows: number };

/**
 * สิ่งที่คนกดยกเลิก "เห็นแล้ว" — ส่งไปกับคำขอยกเลิก ให้ server เทียบกับของจริง
 *
 * ⚠️ dialog เตือนเรื่องเงินตัดสินจาก snapshot ตอนหน้าโหลด ถ้าอีกฝ่ายแจ้งโอนหรือยืนยันเงิน
 * หลังจากนั้น หน้าจอจะยังคิดว่าไม่มีเงินเกี่ยวข้องแล้วยกเลิกได้ในคลิกเดียว — ด่านจริงจึงต้อง
 * อยู่ที่ server: ถ้าจำนวนแถวเงินหรือยอดที่นับแล้วไม่ตรงกับที่ส่งมา ปฏิเสธและให้รีเฟรช
 */
export type MoneyAck = { rows: number; paidCents: number };

export function moneyAckFrom(moved: MoneyMoved | null): MoneyAck {
  return { rows: moved?.rows ?? 0, paidCents: moved?.paidCents ?? 0 };
}

export function moneyMoved(
  paidCents: number,
  rows: readonly { amountCents: number; state: PaymentState }[],
): MoneyMoved | null {
  if (paidCents <= 0 && rows.length === 0) return null;
  const pendingCents = rows.reduce((n, r) => (r.state === "pending" ? n + r.amountCents : n), 0);
  return { paidCents: Math.max(0, paidCents), pendingCents, rows: rows.length };
}

/**
 * กดปุ่มนี้แล้วต้องถามยืนยันก่อนไหม
 *
 * ถามเฉพาะ `cancelled` ที่มีเงินเกี่ยวข้อง — เดิมปุ่มยกเลิกยิงทันทีที่กด
 * ออเดอร์ที่จ่ายไปแล้วครึ่งหนึ่งจึงปิดตายได้จากการกดพลาดครั้งเดียว และไม่มีใครบอก
 * ทั้งสองฝั่งว่าแพลตฟอร์มไม่ได้ถือเงิน คืนเงินให้ไม่ได้
 *
 * ⚠️ ไม่รวม `declined` เพราะทุกเส้นเข้า declined มาจากก่อนตอบรับ ซึ่งจ่ายเงินไม่ได้
 * (`canPay`) ถ้าวันหนึ่งเปิดให้ปฏิเสธหลังรับเงินได้ ต้องเพิ่มที่นี่พร้อมข้อความของมันเอง
 * — ข้อความใน dialog ตอนนี้พูดว่า "ยกเลิกงาน" ตรง ๆ
 */
export function needsMoneyConfirm(to: OrderStatus, moved: MoneyMoved | null): boolean {
  return to === "cancelled" && moved !== null;
}
