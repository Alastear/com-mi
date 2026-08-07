/**
 * ตรวจว่า Blob store ทั้งสองตัวใช้งานได้จริงและตั้งโหมด access ถูกต้อง
 *
 * โปรเจกต์นี้ใช้ **สอง store** เพราะโหมด access กำหนดตอนสร้างและเปลี่ยนทีหลังไม่ได้:
 *
 *   BLOB_READ_WRITE_TOKEN          → public  · รูปหน้าร้าน อวาตาร์ ผลงาน หน้าปกเมนู
 *   BLOB_PRIVATE_READ_WRITE_TOKEN  → private · ไฟล์ WIP และไฟล์ส่งมอบ + สลิปโอนเงิน
 *
 * รูปที่คนเปิดดูซ้ำเยอะต้องเป็น public — private เสิร์ฟช้ากว่าและ egress แพงกว่า
 * เพราะต้องเซ็น URL ใหม่ทุกครั้งและไม่ติด CDN cache
 * ส่วนไฟล์ส่งมอบต้องเป็น private เพราะเป็นด่านเดียวที่กันไฟล์หลุดก่อนจ่ายเงินครบ
 */
import { del, put } from "@vercel/blob";

type Check = {
  label: string;
  env: string;
  access: "public" | "private";
  required: boolean;
};

const CHECKS: Check[] = [
  { label: "รูปหน้าร้าน / ผลงาน", env: "BLOB_READ_WRITE_TOKEN", access: "public", required: true },
  {
    label: "ไฟล์ส่งมอบ / WIP",
    env: "BLOB_PRIVATE_READ_WRITE_TOKEN",
    access: "private",
    // ยังไม่บังคับจนกว่าจะทำระบบส่งไฟล์เสร็จ — แต่ต้องเตือนว่ายังไม่มี
    required: false,
  },
];

const sample = new Blob([new Uint8Array(16)], { type: "image/webp" });
let failed = false;

for (const c of CHECKS) {
  const token = process.env[c.env];
  if (!token) {
    console.log(`${c.required ? "❌" : "⚠️ "} ${c.label} — ยังไม่มี ${c.env}`);
    if (c.required) failed = true;
    continue;
  }

  try {
    const r = await put(`_healthcheck/${Date.now()}.webp`, sample, {
      access: c.access,
      addRandomSuffix: true,
      token,
    });
    await del(r.url, { token });
    console.log(`✅ ${c.label} — store เป็น ${c.access} ตามที่ต้องการ`);
    console.log(`   host: ${new URL(r.url).host}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failed = true;
    if (/private|public/i.test(msg)) {
      console.log(`❌ ${c.label} — store ตั้ง access ผิดโหมด (ต้องเป็น ${c.access})`);
      console.log(`   ${msg}`);
      console.log(`   แก้: สร้าง store ใหม่ให้ถูกโหมด — เปลี่ยนของเดิมไม่ได้`);
    } else {
      console.log(`❌ ${c.label} — ${msg}`);
    }
  }
}

if (failed) process.exit(1);
