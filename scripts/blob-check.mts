/**
 * ตรวจว่า Blob store ใช้งานได้จริงและตั้งโหมด access ถูกต้องไหม
 *
 * โปรเจกต์นี้ต้องการ store แบบ **public** เพราะรูปหน้าร้าน/ผลงานถูกเปิดดูซ้ำเยอะ
 * private จะเสิร์ฟช้ากว่าและ egress แพงกว่ามาก (docs/01-architecture.md §5)
 * private สงวนไว้ให้ไฟล์ส่งมอบงานใน Phase 1c เท่านั้น
 */
import { del, put } from "@vercel/blob";

const sample = new Blob([new Uint8Array(16)], { type: "image/webp" });
const name = `_healthcheck/${Date.now()}.webp`;

try {
  const r = await put(name, sample, { access: "public", addRandomSuffix: true });
  await del(r.url);
  console.log("✅ store เป็น public — พร้อมใช้งาน");
  console.log("   host:", new URL(r.url).host);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("private")) {
    console.log("❌ store ตั้งเป็น private แต่โปรเจกต์ต้องการ public");
    console.log("   แก้: Vercel dashboard → Storage → สร้าง Blob store ใหม่แบบ public");
    console.log("        แล้ว `vercel env pull` หรือวาง BLOB_READ_WRITE_TOKEN ตัวใหม่");
  } else {
    console.log("❌", msg);
  }
  process.exit(1);
}
