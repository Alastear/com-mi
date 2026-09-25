/**
 * ตรรกะเงินล้วน ๆ ของการแจ้งโอน/ยืนยัน — ไม่แตะ DB ใช้ได้ทั้งฝั่ง server และ client
 *
 * ⚠️ ด่านจริงอยู่ใน SQL ของ lib/payments/actions.ts (ตรวจกับแถวล่าสุดใต้ lock)
 * ฟังก์ชันที่นี่ใช้ตัดสินว่าจะโชว์อะไรบนหน้าจอ และใช้ตอบ error ให้ตรงเรื่อง
 * ถ้าแก้กติกาข้อไหน ต้องแก้ทั้งสองที่พร้อมกัน ไม่งั้น UI จะบอกว่ากดได้แต่ server ปฏิเสธ
 */

/**
 * สถานะของแถว payment_record หนึ่งแถว
 *
 *   pending  — ลูกค้าแจ้งแล้ว ครีเอเตอร์ยังไม่ตอบ
 *   verified — ครีเอเตอร์ยืนยันว่าเงินเข้า → **สถานะเดียวที่นับเป็นเงิน**
 *   rejected — ครีเอเตอร์ตอบว่ายังไม่ได้รับ
 *   voided   — เคยยืนยันแล้ว แต่ครีเอเตอร์กดยกเลิกการยืนยัน
 *
 * ลำดับการเช็คสำคัญ: แถว voided ยังมี `verifiedAt` อยู่ (เก็บไว้เป็นหลักฐาน)
 * ถ้าเช็ค verified ก่อน void จะนับเงินที่ถูกยกเลิกไปแล้วกลับเข้ามา
 */
export type PaymentState = "pending" | "verified" | "rejected" | "voided";

export function paymentState(p: {
  verifiedAt: Date | string | null;
  rejectedAt: Date | string | null;
  voidedAt: Date | string | null;
}): PaymentState {
  if (p.voidedAt) return "voided";
  if (p.rejectedAt) return "rejected";
  if (p.verifiedAt) return "verified";
  return "pending";
}

/** ยอดที่ยืนยันแล้วจริง — ต้องตรงกับ `recomputePaidSql` ใน actions.ts ทุกตัวอักษร */
export function verifiedSum(
  rows: readonly { amountCents: number; state: PaymentState }[],
): number {
  return rows.reduce((n, r) => (r.state === "verified" ? n + r.amountCents : n), 0);
}

/** ยอดคงค้าง — ไม่ติดลบ แม้ข้อมูลเก่าจะมียอดเกินราคางานอยู่แล้วก็ตาม */
export function outstandingCents(order: { totalCents: number; amountPaidCents: number }): number {
  return Math.max(0, order.totalCents - order.amountPaidCents);
}

/**
 * ยอดที่ควรโอน "รอบนี้"
 *
 * ยังไม่ถึงมัดจำ = ให้โอนแค่ส่วนที่ขาดของมัดจำ ไม่ใช่ยอดเต็ม — ตรงกับด่าน
 * `depositSatisfied()` ใน transitionOrder ถึงมัดจำแล้วก็คือยอดคงค้างทั้งหมด
 *
 * ครอบด้วยยอดคงค้างเสมอ — ข้อมูลเก่าที่มัดจำเกินราคางานจะได้ไม่ขอเงินเกินราคา
 */
export function dueNowCents(order: {
  totalCents: number;
  amountPaidCents: number;
  depositCents: number;
}): number {
  const outstanding = outstandingCents(order);
  if (order.depositCents > 0 && order.amountPaidCents < order.depositCents) {
    return Math.min(outstanding, order.depositCents - order.amountPaidCents);
  }
  return outstanding;
}

/**
 * ยอดที่ลูกค้าแจ้งได้อยู่ในช่วงที่ยอมรับไหม: 1 สตางค์ ถึงยอดคงค้าง
 *
 * ต้องไม่เกินยอดคงค้าง ไม่งั้นแจ้งยอดเดียวก็ "จ่ายครบ" ได้ทั้งที่โอนมาไม่ถึง
 * แล้วครีเอเตอร์ที่กดยืนยันโดยไม่ได้ดูตัวเลขจะปลดล็อกไฟล์ให้ทันที
 */
export type AmountCheck = "ok" | "invalid" | "over_outstanding";

export function checkReportAmount(amountCents: number, outstanding: number): AmountCheck {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1) return "invalid";
  if (amountCents > outstanding) return "over_outstanding";
  return "ok";
}

/**
 * ยืนยันแถวนี้แล้วยอดรวมยังไม่เกินราคางานไหม
 *
 * นี่คือด่านที่ปิดช่อง "แจ้งซ้ำสองแถว ยืนยันทั้งสองแถว ไฟล์ปลดล็อกทั้งที่เงินเข้าครึ่งเดียว"
 * ยอดเกินราคาไม่มีทางถูกต้อง — ถ้าลูกค้าโอนเกินจริง เป็นเรื่องคืนเงินกันเอง ไม่ใช่นับเพิ่ม
 */
export function fitsUnderTotal(
  amountCents: number,
  verifiedCents: number,
  totalCents: number,
): boolean {
  return verifiedCents + amountCents <= totalCents;
}

/**
 * ช่องกรอกเงินรับเป็น "บาทเต็ม" เหมือนทั้งระบบ (ราคา/มัดจำถูกปัดเป็นบาทหมด)
 *
 * คืนเป็นสตางค์ หรือ null ถ้าไม่ใช่จำนวนเต็มบวก — ไม่เดาจากทศนิยมหรือตัวอักษรปน
 * เพราะ "1,500.50" ที่ถูกตัดเงียบ ๆ เป็น 1,500 คือยอดที่คนพิมพ์ไม่ได้ตั้งใจ
 */
export function parseBaht(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{1,7}$/.test(s)) return null;
  const baht = Number(s);
  if (baht < 1) return null;
  return baht * 100;
}

/** ค่าตั้งต้นของช่องกรอก — ยอดเป็นสตางค์ที่ไม่ลงตัว (ข้อมูลเก่า) ปัดลง จะได้ไม่เกินยอดคงค้าง */
export function toBahtInput(cents: number): string {
  return cents > 0 ? String(Math.floor(cents / 100)) : "";
}
