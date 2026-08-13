/**
 * โทเคนของลิงก์คำเชิญ
 *
 * ⚠️ **ต้องไม่ใช้ `id` ของแถวเป็นตัวระบุใน URL** — `newId()` เรียงตามเวลา
 * ใบที่ออกติด ๆ กันจึงเดาจากใบข้างเคียงได้ (เหตุผลเดียวกับที่ `order.code`
 * ไม่ใช้ id ดู `lib/db/schema/order.ts`)
 *
 * ใช้ตัวอักษร Crockford base32 ตัดตัวที่อ่านสับสน (I L O U) ออก เพราะลิงก์นี้
 * ถูกพิมพ์ตามด้วยมือได้จริงเวลาส่งกันในแชต
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 22;

export function generateInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** ใช้ตรวจ param ก่อนยิง query — กันการยิงมั่วเข้ามาทีละพันครั้ง */
export function isInviteToken(value: string): boolean {
  return value.length === LENGTH && [...value].every((c) => ALPHABET.includes(c));
}
