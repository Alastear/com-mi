/**
 * ล้างข้อมูลร้านของผู้ใช้คนหนึ่งให้กลับไปเหมือนเพิ่งล็อกอินครั้งแรก
 *
 * ใช้ตอนอยากลองเดิน journey ของครีเอเตอร์ใหม่ซ้ำโดยไม่ต้องสร้างบัญชี Google ใหม่
 * ลบเฉพาะของที่ครีเอเตอร์สร้างเอง — ไม่แตะ user/session จึงยังล็อกอินค้างอยู่ได้
 *
 * ⚠️ dev tool — ลบข้อมูลจริงทิ้งถาวร
 *    pnpm db:reset-creator <email|handle>
 */
import { neon } from "@neondatabase/serverless";

const target = process.argv[2];
if (!target) {
  console.error("ระบุอีเมลหรือ handle: pnpm db:reset-creator you@example.com");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL!);
const key = target.toLowerCase().replace(/^@/, "");

const user = (
  await sql`select id, name, email, handle from "user" where lower(email) = ${key} or handle = ${key} limit 1`
)[0] as { id: string; name: string; email: string; handle: string } | undefined;

if (!user) {
  console.error(`ไม่พบผู้ใช้: ${target}`);
  process.exit(1);
}

// creator_page ผูก cascade กับ service/portfolio/order อยู่แล้ว ลบต้นทางพอ
const pages = await sql`delete from creator_page where user_id = ${user.id} returning id`;
const media = await sql`delete from media where owner_user_id = ${user.id} returning id`;

console.log(`รีเซ็ต ${user.name} (${user.email}) แล้ว`);
console.log(`  ลบหน้าร้าน ${(pages as unknown[]).length} · ไฟล์ ${(media as unknown[]).length}`);
console.log(`  handle @${user.handle} ยังอยู่ — เปิด /dashboard จะเจอเช็กลิสต์ตั้งร้านตั้งแต่ต้น`);
console.log(`  หมายเหตุ: ไฟล์ใน Blob ไม่ถูกลบ (ลบเฉพาะแถวใน DB)`);
