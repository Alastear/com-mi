/**
 * รหัสออเดอร์ที่ใช้ใน URL — `/orders/K7M2QX4P`
 *
 * ตัดตัวที่อ่านสับสนออก (0/O, 1/I/L) เพราะลูกค้ากับครีเอเตอร์ต้องอ่านรหัสนี้
 * ให้กันทางแชทหรือทางโทรศัพท์จริง ๆ
 *
 * 8 ตัวจากตัวอักษร 30 ตัว ≈ 6.6×10¹¹ ความเป็นไปได้ — เดาไม่ได้ในทางปฏิบัติ
 * แต่ยังต้องเช็คซ้ำใน DB อยู่ดี เพราะโอกาสชนไม่ใช่ศูนย์
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LENGTH = 8;

export function generateOrderCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** ใช้ตรวจ param ก่อนยิง query — กันการยิงมั่วเข้ามาทีละพันครั้ง */
export function isOrderCode(value: string): boolean {
  return value.length === LENGTH && [...value].every((c) => ALPHABET.includes(c));
}
