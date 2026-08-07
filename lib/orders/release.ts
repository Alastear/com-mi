/**
 * เงื่อนไข "จ่ายครบแล้ว" — จุดเดียวในระบบ
 *
 * ทั้งด่านเปลี่ยนสถานะเป็น `delivered` และด่านออก URL ดาวน์โหลดต้องเรียกตัวนี้
 * ถ้าเขียนเงื่อนไขซ้ำสองที่ วันหนึ่งจะแก้ที่เดียวแล้วอีกที่ยังปล่อยผ่าน
 *
 * ⚠️ `totalCents > 0` ไม่ใช่ของแถม — ออเดอร์ยอด ฿0 มีจริง
 * (เมนูตั้งราคา 0 ได้ และโหมด `proposal` ยังไม่มี action ไหนเขียน `totalCents`)
 * ถ้าเช็คแค่ `paid >= total` ออเดอร์แบบนั้นจะ "จ่ายครบ" ตั้งแต่วินาทีที่สร้าง
 */
export function canRelease(order: { totalCents: number; amountPaidCents: number }): boolean {
  return order.totalCents > 0 && order.amountPaidCents >= order.totalCents;
}

/** ยอดมัดจำครบแล้วหรือยัง — 0 = ไม่บังคับมัดจำ */
export function depositSatisfied(order: {
  depositCents: number;
  amountPaidCents: number;
}): boolean {
  return order.depositCents === 0 || order.amountPaidCents >= order.depositCents;
}
