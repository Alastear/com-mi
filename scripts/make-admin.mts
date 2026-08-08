/**
 * ให้สิทธิ์ผู้ดูแลแพลตฟอร์มกับบัญชีหนึ่ง
 *
 * `role` ตั้งจากฝั่ง client ไม่ได้ (`input: false` ใน lib/auth.ts) — ตั้งใจให้เป็นแบบนั้น
 * ทางเดียวคือรันตรงกับฐานข้อมูล ซึ่งแปลว่าต้องถือ DATABASE_URL อยู่แล้ว
 *
 *   pnpm admin:grant you@example.com
 *   pnpm admin:revoke you@example.com
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) { console.error("ต้องมี DATABASE_URL"); process.exit(1); }

const who = process.argv[2];
const revoke = process.argv.includes("--revoke");
if (!who) {
  console.error("ใช้: pnpm admin:grant <อีเมลหรือ handle>");
  process.exit(1);
}

const sql = neon(url);
const role = revoke ? "user" : "admin";
const rows = await sql`
  update "user" set role = ${role}, updated_at = now()
  where email = ${who} or handle = ${who}
  returning email, handle, role`;

if (!rows.length) {
  console.error(`ไม่เจอผู้ใช้ที่ตรงกับ "${who}" — ต้องล็อกอินเข้าเว็บอย่างน้อยหนึ่งครั้งก่อน`);
  process.exit(1);
}
for (const r of rows) console.log(`${r.email} (@${r.handle ?? "—"}) → role=${r.role}`);
console.log(revoke ? "ถอดสิทธิ์แล้ว มีผลทันทีกับ session ที่เปิดค้างอยู่" : "เข้าได้ที่ /admin");
