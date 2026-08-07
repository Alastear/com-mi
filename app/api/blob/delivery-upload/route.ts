import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth-guard";
import { privateBlobToken } from "@/lib/blob/stores";
import { isOrderCode } from "@/lib/orders/code";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * ออก token ให้ครีเอเตอร์อัปโหลดไฟล์ส่งมอบตรงไป **store ส่วนตัว**
 *
 * ⚠️ เป็น route แยกจาก `/api/blob/upload` โดยตั้งใจ ไม่ใช่ route เดียวที่แตกกิ่ง
 * ถ้าเลือก store จาก `kind` ที่ client ส่งมา ปลายทางของไฟล์จะขึ้นกับข้อมูลที่แก้ได้
 * แยกเป็นคนละ URL แปลว่า store เป็นคุณสมบัติของ endpoint ไม่ใช่ของ payload
 *
 * ⚠️ **ไม่ตรวจว่าจ่ายเงินครบหรือยัง** — อัปโหลดก่อนได้เงินไม่อันตราย
 * (ทดสอบแล้ว: anonymous GET ที่ store ส่วนตัวได้ 403) ด่านเรื่องเงินอยู่ที่
 * `delivery.releasedAt` กับ `canRelease()` ตอนขอ URL ดาวน์โหลด ไม่ใช่ตอนอัปโหลด
 * ครีเอเตอร์ต้องเตรียมไฟล์ไว้ก่อนแล้วค่อยกดส่งมอบได้
 */

/** ข้อความผิดพลาดที่ยอมให้ออกไปถึงเบราว์เซอร์ — ห้ามส่งข้อความดิบจาก SDK */
type UploadError = "forbidden" | "invalid_state" | "upload_failed";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      token: privateBlobToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await getSession();
        if (!session) throw new Error("forbidden");

        const code = (JSON.parse(clientPayload ?? "{}") as { code?: string }).code;
        if (!code || !isOrderCode(code)) throw new Error("forbidden");

        const order = await getDb().query.order.findFirst({
          where: eq(schema.order.code, code),
          columns: { id: true, status: true },
          with: { page: { columns: { userId: true } } },
        });
        // ไม่มีออเดอร์ กับไม่ใช่ของเรา ตอบเหมือนกัน — ไม่บอกว่ามีอยู่แต่เข้าไม่ได้
        if (!order || order.page.userId !== session.user.id) throw new Error("forbidden");

        /**
         * อัปโหลดได้เฉพาะช่วงที่ยัง "ทำงานอยู่"
         * สถานะเหล่านี้คือทั้งหมดที่ครีเอเตอร์เดินไป `delivered` ได้จาก state machine
         * ปิดออเดอร์แล้วยังอัปไฟล์เข้าไปได้ = เพิ่มของเข้าหลักฐานที่ปิดไปแล้ว
         */
        if (!["in_progress", "in_review", "revision_requested"].includes(order.status)) {
          throw new Error("invalid_state");
        }

        /**
         * ⚠️ `pathname` มาจาก client และ **เซิร์ฟเวอร์แก้ไม่ได้** —
         * handleUpload เอาสตริงนี้ใส่ token ไปตรง ๆ การปฏิเสธจึงเป็นทางเดียวที่มี
         * บังคับ prefix เป็น id ของออเดอร์ เพื่อไม่ให้เขียนทับไฟล์ของออเดอร์อื่น
         */
        if (!pathname.startsWith(`deliveries/${order.id}/`)) throw new Error("forbidden");

        const gate = await rateLimit(
          `delivery:${session.user.id}`,
          LIMITS.deliveryUpload.limit,
          LIMITS.deliveryUpload.windowSeconds,
        );
        if (!gate.ok) throw new Error("forbidden");

        return {
          /**
           * ไม่จำกัดชนิดไฟล์ — ไฟล์ส่งมอบเป็น PSD, CLIP, ZIP, MP4 ได้ทั้งนั้น
           * และ `maximumSizeInBytes` บังคับไม่ได้จริงกับ multipart (ทดสอบแล้ว:
           * ตั้งเพดาน 1 MiB แล้วอัป 6 MiB ผ่าน) โควตาจึงต้องไปตรวจหลังอัปโหลด
           * ด้วยขนาดจริงจาก head() แล้วลบทิ้งถ้าเกิน — ดู lib/delivery/register.ts
           */
          addRandomSuffix: true,
          // token มีอายุสั้น ๆ พอให้เริ่มอัปโหลด ไม่ใช่ให้ถือไว้ทั้งวัน
          validUntil: Date.now() + 30 * 60_000,
        };
      },
    });

    return Response.json(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    // log ข้อความจริงไว้ฝั่งเรา แต่ตอบ client ด้วยชุดคำที่ควบคุมได้
    // ข้อความจาก SDK เคยมี pathname ของ blob อื่นติดมาด้วย
    console.error("[delivery-upload]", raw);
    const code: UploadError =
      raw === "forbidden" ? "forbidden" : raw === "invalid_state" ? "invalid_state" : "upload_failed";
    return Response.json({ error: code }, { status: code === "upload_failed" ? 500 : 403 });
  }
}
