/**
 * สร้าง slug สำหรับ URL ของเมนูรับงาน
 *
 * ยอมให้ตัวอักษรทุกภาษาผ่าน (`\p{L}`) ไม่ใช่แค่ ASCII — ผู้ใช้หลักเป็นคนไทย
 * ถ้าตัดเหลือแต่ ASCII ชื่อเมนูภาษาไทยทุกอันจะได้ slug ว่างเหมือนกันหมด
 * เบราว์เซอร์เข้ารหัส/ถอดรหัส path ที่เป็นไทยให้เอง และ Next ถอดให้ใน params แล้ว
 *
 * ต้องมี `\p{M}` ด้วย — สระบน/ล่างและวรรณยุกต์ไทย (ิ ึ ั ่ ้) เป็น Mark ไม่ใช่ Letter
 * ถ้าเอาออก "ครึ่ง" กับ "ครัง" จะเหลือ "ครง" เหมือนกัน คนละคำแต่ได้ slug ชนกัน
 */
export function slugify(input: string): string {
  return input
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{M}\p{N}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * ทำให้ slug ไม่ชนกับของเดิมในร้านเดียวกัน โดยต่อ -2, -3 … ไปเรื่อย ๆ
 * `taken` คือ slug ที่ใช้อยู่แล้ว (ไม่รวมของตัวเองตอนแก้ไข)
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base || "service";
  if (!used.has(root)) return root;
  for (let n = 2; n < 999; n++) {
    const candidate = `${root}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}
