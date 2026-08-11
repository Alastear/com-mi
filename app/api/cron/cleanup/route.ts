import { timingSafeEqual } from "node:crypto";
import { cleanupMedia } from "@/lib/media/cleanup";

/**
 * งานเก็บกวาดรายวัน — Vercel Cron เป็นคนเรียก (ตั้งเวลาไว้ใน `vercel.json`)
 *
 * Vercel ยิงมาพร้อมหัว `Authorization: Bearer $CRON_SECRET`
 * ⚠️ route นี้อยู่นอก matcher ของ `proxy.ts` (ซึ่งครอบเฉพาะหน้าจอ) จึงต้องตรวจเอง
 * ทั้งหมด ไม่มีชั้นไหนตรวจให้ก่อนเลย
 *
 * ตอบ 404 ไม่ใช่ 401 เมื่อกุญแจไม่ถูก — เหตุผลเดียวกับ `requireAdmin()`
 * คนที่ยิงมั่วไม่ควรได้รู้ด้วยซ้ำว่ามี endpoint นี้อยู่
 */

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // ยังไม่ได้ตั้งกุญแจ = ปิดไว้ ไม่ใช่เปิดให้ใครก็เรียกได้
  if (!secret) return new Response("Not found", { status: 404 });

  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return new Response("Not found", { status: 404 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const report = await cleanupMedia({ dryRun });

  // ขึ้น log ให้เห็นใน Vercel เสมอ — งานที่ไม่มีใครดูผลคืองานที่พังเงียบ ๆ ได้
  console.log("[cron/cleanup]", JSON.stringify({ dryRun, ...report }));

  return Response.json({ dryRun, ...report });
}

/**
 * เทียบแบบใช้เวลาคงที่ — การเทียบสตริงธรรมดาหยุดทันทีที่เจอตัวอักษรต่างกัน
 * ความต่างของเวลาตอบกลับจึงบอกใบ้ได้ว่ากุญแจถูกไปกี่ตัว
 */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // ความยาวไม่เท่ากันก็รู้ได้จากขนาดอยู่แล้ว ไม่ได้ปิดบังอะไรเพิ่ม
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}
