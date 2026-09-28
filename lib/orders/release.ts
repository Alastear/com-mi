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
 * ย้ายไปสถานะนี้ติดเงื่อนไขเงินข้อไหนไหม — คืน error ที่ตอบกลับได้เลย หรือ null ถ้าเงินไม่ใช่ปัญหา
 *
 *   in_progress → ต้องถึงมัดจำ (`depositSatisfied`)
 *   delivered   → ต้องจ่ายครบ (`canRelease` — ตัวเดียวกับด่านออก URL ดาวน์โหลด
 *                 ห้ามเขียน `paid >= total` ซ้ำที่ไหนอีก ไม่งั้นสองด่านจะเพี้ยนออกจากกัน)
 *
 * `transitionOrder` เรียกสองรอบ: ก่อนเขียนเพื่อตอบให้ตรงเรื่อง และหลังเขียนไม่ผ่าน
 * เพื่อแยกว่า "เงินลดลงระหว่างทาง" กับ "มีคนเปลี่ยนสถานะไปก่อน" (`stale`)
 *
 * ⚠️ ด่านจริงคือ `moneyGateSql()` ใน release-sql.ts ที่อยู่ใน WHERE ของ UPDATE
 * แก้กติกาที่นี่ต้องแก้ที่นั่นด้วยเสมอ
 */
export type MoneyBlock = "deposit_unpaid" | "not_fully_paid";

export function moneyBlock(
  to: OrderStatus,
  order: { totalCents: number; amountPaidCents: number; depositCents: number },
): MoneyBlock | null {
  if (to === "in_progress" && !depositSatisfied(order)) return "deposit_unpaid";
  if (to === "delivered" && !canRelease(order)) return "not_fully_paid";
  return null;
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

/**
 * แผงชำระเงินบนหน้าออเดอร์ควรอยู่ในโหมดไหน
 *
 *   open    — จ่าย/แจ้งโอน/ยืนยันได้ตามปกติ
 *   not_yet — ยังไม่ตอบรับ ยังไม่มีช่องทางจ่าย
 *   closed  — ออเดอร์จบแล้ว (ยกเลิก/ปฏิเสธ/หมดอายุ/เสร็จสมบูรณ์) ประวัติเงินแสดงแบบอ่านอย่างเดียว
 *
 * ⚠️ เช็ค closed ก่อน open เสมอ — `completed` อยู่ในทั้ง `canPay` และสถานะปลายทาง
 * ตัดสินไว้ว่าหน้าจอถือว่าออเดอร์ที่เสร็จแล้วปิดบัญชี ไม่มีปุ่มขยับเงินอีก
 * ส่วน server ยังรับ `recordPayment` บน `completed` อยู่ (ด่านจริงไม่ได้แคบลง)
 *
 * เดิมหน้าจอดูแค่ `canPay()` ออเดอร์ที่ยกเลิกหลังจ่ายเงินแล้วจึงตกไปอยู่ฝั่ง
 * "ยังไม่ต้องโอน รอครีเอเตอร์ตอบรับ" และรายการเงินที่จ่ายไปแล้วหายไปจากหน้าทั้งสองฝั่ง
 * ทั้งที่ตอนนั้นคือเวลาที่ทั้งคู่ต้องใช้หลักฐานนี้คุยเรื่องคืนเงินกันมากที่สุด
 */
export type PaymentMode = "open" | "not_yet" | "closed";

/**
 * ⚠️ `completed` **ไม่** นับเป็น closed
 *
 * งานเสร็จแล้วยังต้องแก้เรื่องเงินได้: ลูกค้าส่งสลิปปลอม ครีเอเตอร์ยืนยันแล้วส่งงาน
 * ลูกค้ากดเสร็จ — ภายหลังครีเอเตอร์เพิ่งพบว่าเงินไม่เข้า ต้องยังกด "ยกเลิกการยืนยัน" ได้
 * (ซึ่งทำให้ `canRelease()` ล็อกไฟล์กลับทันที) และถ้ายังค้างยอด ลูกค้าต้องยังจ่ายได้
 * แผงแบบ open ซ่อน QR/ฟอร์มเองอยู่แล้วเมื่อไม่มียอดค้าง
 */
const CLOSED_FOR_MONEY: readonly OrderStatus[] = ["cancelled", "declined", "expired"];

export function paymentMode(status: OrderStatus): PaymentMode {
  if (CLOSED_FOR_MONEY.includes(status)) return "closed";
  return canPay(status) ? "open" : "not_yet";
}
