import { timingSafeEqual } from "node:crypto";
import { cleanupMedia, type CleanupReport } from "@/lib/media/cleanup";
import { runLifecycle, type LifecycleReport } from "@/lib/orders/lifecycle-run";
import { isOrderCode } from "@/lib/orders/code";

/**
 * งานรายวัน — Vercel Cron เป็นคนเรียก (ตั้งเวลาไว้ใน `vercel.json`)
 *
 * Vercel ยิงมาพร้อมหัว `Authorization: Bearer $CRON_SECRET`
 * ⚠️ route นี้อยู่นอก matcher ของ `proxy.ts` (ซึ่งครอบเฉพาะหน้าจอ) จึงต้องตรวจเอง
 * ทั้งหมด ไม่มีชั้นไหนตรวจให้ก่อนเลย
 *
 * ตอบ 404 ไม่ใช่ 401 เมื่อกุญแจไม่ถูก — เหตุผลเดียวกับ `requireAdmin()`
 * คนที่ยิงมั่วไม่ควรได้รู้ด้วยซ้ำว่ามี endpoint นี้อยู่
 *
 * มีสองขั้นใน route เดียว — Vercel Hobby ให้ cron แค่วันละครั้งและจำนวนงานจำกัด
 * จึงต่อขั้นใหม่เข้าที่นี่แทนการเพิ่ม cron ตัวที่สอง:
 *   media     — เก็บกวาดไฟล์ที่ไม่มีใครใช้ (lib/media/cleanup.ts)
 *   lifecycle — หมดอายุคำขอ/ใบเสนอราคาที่ค้าง เตือนและปิดงานที่ส่งแล้ว (lib/orders/lifecycle-run.ts)
 * ขั้นหนึ่งพังไม่ลากอีกขั้นพังตาม — แต่ละขั้นรายงานผลของตัวเอง
 *
 * พารามิเตอร์ (ทุกตัวต้องมีกุญแจอยู่ดี):
 *   ?dry=1           ดูว่าจะทำอะไร โดยไม่เขียนอะไรเลย
 *   ?only=lifecycle  รันเฉพาะขั้นนั้น (media | lifecycle)
 *   ?code=XXXXXXXX   (ซ้ำได้) ขั้น lifecycle ดูเฉพาะออเดอร์เหล่านี้ — และข้ามขั้น media
 *                    ⚠️ มีไว้ตรวจบนเครื่องกับข้อมูลทดสอบ เครื่อง dev ต่อ DB ตัวเดียวกับ production
 *                    รันจริงโดยไม่จำกัดจะไปปิดออเดอร์ของผู้ใช้จริง ลบไฟล์จริง และส่งอีเมลหาคนจริง
 */

/**
 * ขั้น lifecycle ทำงานได้สูงสุด 50 ใบต่อกติกาต่อรอบ แต่ละใบคือหนึ่ง round-trip ไป Neon
 * — ให้เวลาพอโดยไม่ต้องพึ่งค่าตั้งต้นของแพลตฟอร์ม (อีเมลที่ตามมาอยู่ใน `after()` ซึ่งใช้เวลาของ route นี้ด้วย)
 */
export const maxDuration = 60;

type Stage = "media" | "lifecycle";
const STAGES: readonly Stage[] = ["media", "lifecycle"];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // ยังไม่ได้ตั้งกุญแจ = ปิดไว้ ไม่ใช่เปิดให้ใครก็เรียกได้
  if (!secret) return new Response("Not found", { status: 404 });

  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return new Response("Not found", { status: 404 });
  }

  const query = new URL(request.url).searchParams;
  const dryRun = query.get("dry") === "1";

  const rawCodes = query.getAll("code");
  // code ผิดรูปแม้ตัวเดียว = ไม่ทำอะไรเลย — ห้ามตีความว่า "ไม่จำกัด" แล้วไปรันกับออเดอร์ทั้งระบบ
  if (rawCodes.some((c) => !isOrderCode(c))) {
    return Response.json({ error: "bad_code" }, { status: 400 });
  }
  const codes = rawCodes.length > 0 ? rawCodes : null;

  const only = query.get("only");
  if (only !== null && !STAGES.includes(only as Stage)) {
    return Response.json({ error: "bad_stage" }, { status: 400 });
  }
  const run = (stage: Stage) => {
    if (only) return only === stage;
    // จำกัดออเดอร์แล้ว = ตั้งใจทดสอบเฉพาะจุด ขั้น media ไม่มีขอบเขตแบบนั้น จึงไม่รัน
    return !(codes && stage === "media");
  };

  const report: {
    dryRun: boolean;
    media?: CleanupReport | { failed: string };
    lifecycle?: LifecycleReport | { failed: string };
  } = { dryRun };

  if (run("media")) {
    try {
      report.media = await cleanupMedia({ dryRun });
    } catch (err) {
      report.media = { failed: err instanceof Error ? err.message : String(err) };
    }
  }

  if (run("lifecycle")) {
    try {
      report.lifecycle = await runLifecycle({ dryRun, codes });
    } catch (err) {
      report.lifecycle = { failed: err instanceof Error ? err.message : String(err) };
    }
  }

  // ขึ้น log ให้เห็นใน Vercel เสมอ — งานที่ไม่มีใครดูผลคืองานที่พังเงียบ ๆ ได้
  console.log("[cron/cleanup]", JSON.stringify(report));

  return Response.json(report);
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
