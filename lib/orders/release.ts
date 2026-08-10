import type { OrderStatus } from "@/lib/types";

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

/**
 * ออเดอร์นี้รับเงินได้หรือยัง — **ครีเอเตอร์ต้องตอบรับก่อนเสมอ**
 *
 * เดิมแผงจ่ายเงินกับ QR พร้อมเพย์แสดงตลอดโดยไม่ดูสถานะเลย ลูกค้าจึงโอนได้ทันที
 * ที่กดส่งคำขอ ก่อนครีเอเตอร์จะทันเห็นด้วยซ้ำ ซึ่งพังได้จริงสองทาง:
 * ครีเอเตอร์ปฏิเสธงานทีหลังแล้วเงินโอนไปแล้ว (แพลตฟอร์มไม่ได้ถือเงิน คืนให้ไม่ได้)
 * หรือครีเอเตอร์อยากปรับราคาก่อน แต่ลูกค้าจ่ายราคาเดิมไปแล้ว
 *
 * เขียนเป็นรายการที่ "อนุญาต" ไม่ใช่รายการที่ "ห้าม" — สถานะใหม่ที่เพิ่มทีหลัง
 * จะถูกปฏิเสธไว้ก่อนจนกว่าจะมีคนตัดสินใจ ดีกว่าเปิดรับเงินโดยไม่มีใครคิดถึง
 *
 * `completed` ยังจ่ายได้ เพราะงานที่แบ่งจ่ายมักเคลียร์ยอดหลังรับงาน
 */
const PAYABLE_STATUSES: readonly OrderStatus[] = [
  "accepted",
  "in_progress",
  "in_review",
  "revision_requested",
  "delivered",
  "completed",
];

export function canPay(status: OrderStatus): boolean {
  return PAYABLE_STATUSES.includes(status);
}
