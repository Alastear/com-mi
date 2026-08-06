/**
 * ID แบบเรียงตามเวลาได้ (ULID-ish)
 *
 * 10 ตัวแรกคือเวลาเป็น base32 → เรียงตามตัวอักษรแล้วได้ลำดับเวลาพอดี
 * ทำให้ index ของ Postgres แทรกที่ปลายเสมอ ไม่กระจายทั่ว B-tree แบบ UUIDv4
 * (ดู docs/02-data-model.md — กติกาทั่วไป)
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 ตัด I L O U ที่สับสน

function encodeTime(ms: number, len: number): string {
  let out = "";
  for (let i = len - 1; i >= 0; i--) {
    out = ALPHABET[ms % 32] + out;
    ms = Math.floor(ms / 32);
  }
  return out;
}

function randomPart(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
}

/** เช่น `svc_01JQK2M4X8ZP3RTVWY6NBC` — prefix ช่วยให้อ่าน log แล้วรู้ทันทีว่าเป็นตารางไหน */
export function newId(prefix: string): string {
  return `${prefix}_${encodeTime(Date.now(), 10)}${randomPart(12)}`;
}
