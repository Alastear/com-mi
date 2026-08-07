/**
 * สร้าง user + session จริงในฐานข้อมูล แล้วพิมพ์คุกกี้ที่เซ็นถูกต้องออกมา
 *
 * ใช้ตรวจว่าโซ่ session → UI ทำงาน โดยไม่ต้องกดล็อกอิน Google จริง
 * (ตัว OAuth เองตรวจแยกแล้วว่า redirect_uri ถูกต้อง)
 *
 * ⚠️ เครื่องมือสำหรับ dev เท่านั้น — อย่ารันกับฐานข้อมูล production
 *    ลบผู้ใช้ทดสอบทิ้งด้วย: pnpm db:unseed-test
 *
 * ⚠️ แต่ dev กับ production ใช้ฐานข้อมูล Neon ตัวเดียวกันอยู่ตอนนี้
 *    ร้านของผู้ใช้ทดสอบจึงเคยหลุดไปโผล่ใน /explore บนเว็บจริงมาแล้ว
 *    (ชื่อร้าน "ทดสอบ E2E" พร้อมเบอร์ PromptPay ที่ใส่ไว้ตอนทดสอบ)
 *    ทุกครั้งที่รัน จึงบังคับ is_demo ให้ร้านของผู้ใช้ทดสอบเสมอ — ดูตรง ๆ ที่ /@handle ได้
 *    แต่ไม่เข้าหน้าค้นหาและไม่เข้า sitemap ตามตัวกรองใน listPublicShops
 */
import { neon } from "@neondatabase/serverless";
import { makeSignature } from "better-auth/crypto";

/** `--no-handle` จำลองคนที่เพิ่งล็อกอิน Google ครั้งแรก (ยังไม่ได้ทำ onboarding) */
const noHandle = process.argv.includes("--no-handle");
const TEST_EMAIL = noHandle ? "e2e-new@commi.local" : "e2e-test@commi.local";

const url = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
if (!url || !secret) {
  console.error("ต้องมี DATABASE_URL และ BETTER_AUTH_SECRET");
  process.exit(1);
}

const sql = neon(url);

if (process.argv.includes("--clean")) {
  await sql`delete from "user" where email like 'e2e-%@commi.local'`;
  console.log("ลบผู้ใช้ทดสอบแล้ว");
  process.exit(0);
}

const userId = noHandle ? "e2e_user_0002" : "e2e_user_0001";
const sessionId = noHandle ? "e2e_sess_0002" : "e2e_sess_0001";
const token = "e2e_token_" + Math.random().toString(36).slice(2, 14);
const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

const name = noHandle ? "ผู้ใช้ใหม่" : "ทดสอบ E2E";
const handle = noHandle ? null : "e2etester";
await sql`
  insert into "user" (id, name, email, email_verified, image, handle, plan, role)
  values (${userId}, ${name}, ${TEST_EMAIL}, true, null, ${handle}, 'free', 'user')
  on conflict (id) do update set name = excluded.name, handle = excluded.handle
`;
await sql`delete from session where user_id = ${userId}`;
await sql`
  insert into session (id, user_id, token, expires_at)
  values (${sessionId}, ${userId}, ${token}, ${expires.toISOString()})
`;

/**
 * กันร้านของผู้ใช้ทดสอบไม่ให้ปนกับร้านจริงในหน้าค้นหา
 *
 * ต้องรันทุกครั้ง ไม่ใช่แค่ตอนสร้างผู้ใช้ เพราะร้านเกิดจากการเดิน onboarding ในเบราว์เซอร์
 * ทีหลัง — ตอนที่สคริปต์นี้จบไปแล้ว ครั้งถัดไปที่รันจึงเป็นจุดที่ตามเก็บได้
 */
const demoed = await sql`
  update creator_page set is_demo = true
  where user_id in (select id from "user" where email like 'e2e-%@commi.local')
    and is_demo = false
  returning id
`;
if (demoed.length) console.error(`  (ตั้ง is_demo ให้ร้านทดสอบ ${demoed.length} ร้าน)`);

// Better Auth เก็บคุกกี้เป็น "<token>.<signature>" — เซ็นด้วย secret เดียวกับที่ตั้งไว้
const signature = await makeSignature(token, secret);
console.log(`better-auth.session_token=${token}.${signature}`);
