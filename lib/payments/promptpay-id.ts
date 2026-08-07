/**
 * ตรวจรูปแบบหมายเลข PromptPay
 *
 * ตรวจแค่ "รูปแบบ" ไม่ใช่ "มีอยู่จริงไหม" — ไม่มีทางรู้จากฝั่งเราว่าเบอร์นี้ผูก PromptPay แล้วหรือยัง
 * ด่านจริงคือให้ครีเอเตอร์สแกน QR ของตัวเองหนึ่งครั้งแล้วดูว่าชื่อผู้รับถูกไหม
 * (ข้อความเตือนอยู่ที่ settings.promptpayVerifyNote)
 *
 * ตั้งใจ **ไม่** ตรวจ checksum mod-11 ของเลขบัตรประชาชน — สูตรที่หาได้ยังไม่ได้ยืนยัน
 * และการปฏิเสธเลขที่ถูกต้องเพราะสูตรผิด เจ็บกว่าการรับเลขผิดที่ผู้ใช้เห็นเองตอนสแกน
 */

export const PROMPTPAY_TYPES = ["phone", "national_id"] as const;
export type PromptPayType = (typeof PROMPTPAY_TYPES)[number];

/** ตัดทุกอย่างที่ไม่ใช่ตัวเลขออก — ผู้ใช้พิมพ์ 08x-xxx-xxxx หรือเว้นวรรคมาได้ */
export function normalizePromptPayId(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidPromptPayId(type: PromptPayType, input: string): boolean {
  const digits = normalizePromptPayId(input);
  if (type === "phone") return /^0\d{9}$/.test(digits);
  return /^\d{13}$/.test(digits);
}

/** แสดงแบบอ่านง่าย: 0812345678 → 081-234-5678 */
export function formatPromptPayId(type: PromptPayType, input: string): string {
  const d = normalizePromptPayId(input);
  if (type === "phone" && d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (type === "national_id" && d.length === 13)
    return `${d.slice(0, 1)}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d.slice(12)}`;
  return d;
}
