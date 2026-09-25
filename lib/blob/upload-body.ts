import type { HandleUploadBody } from "@vercel/blob/client";

/**
 * ตรวจ body ของ route ออก token อัปโหลด **ก่อน** ส่งเข้า `handleUpload()`
 *
 * เหตุผล: body มาจากใครก็ได้บนอินเทอร์เน็ต ถ้าส่งตรงเข้า SDK ค่าที่เพี้ยนจะกลายเป็น
 * `TypeError` / "Invalid event type" จากข้างใน ซึ่งแยกไม่ออกจากความล้มเหลวของ
 * Blob จริง ผลคือตอบ 500 ให้ request ขยะ — log เต็มไปด้วย error ปลอมและ
 * alert ที่ควรดังตอน Blob ล่มจริงจะจมหายไปในนั้น
 *
 * ⚠️ เป็นไฟล์บริสุทธิ์ ห้าม import "server-only" หรือ DB — มีเทสต์ด้วย node:test
 */

/** คำขอออก token — เหตุการณ์เดียวที่ route อัปโหลดของเรารับ */
export type ClientTokenRequest = Extract<HandleUploadBody, { type: "blob.generate-client-token" }>;

/**
 * รูปร่างเดียวกับที่ `upload()` ของ @vercel/blob/client ส่งมา
 * (`retrieveClientToken` ใน SDK: `{ type, payload: { pathname, clientPayload, multipart } }`)
 *
 * `clientPayload` กับ `multipart` อาจหายไปทั้งคีย์ได้ — ฝั่ง client ใช้ `JSON.stringify`
 * ซึ่งทิ้งคีย์ที่เป็น `undefined` จึงยอม `undefined` ด้วย ไม่ใช่แค่ตาม type ของ SDK
 *
 * ⚠️ ตั้งใจ **ไม่** รับ `blob.upload-completed` — route ของเราไม่ได้ตั้ง
 * `onUploadCompleted` หรือ `callbackUrl` Vercel จึงไม่มีทางยิงเหตุการณ์นั้นมา
 * ถ้าวันหนึ่งเพิ่ม callback ต้องมาขยายฟังก์ชันนี้ด้วย ไม่งั้น callback จะได้ 400 เงียบ ๆ
 *
 * ⚠️ อัปเกรด @vercel/blob แล้วรูปร่างคำขอเปลี่ยน = อัปโหลดล้มทั้งระบบด้วย 400
 * ถ้าเห็น `bad_request` พุ่งหลังอัปเกรด ให้ดู `retrieveClientToken` ในเวอร์ชันใหม่ก่อน
 */
export function isClientTokenRequest(body: unknown): body is ClientTokenRequest {
  if (typeof body !== "object" || body === null) return false;
  const { type, payload } = body as { type?: unknown; payload?: unknown };
  if (type !== "blob.generate-client-token") return false;
  if (typeof payload !== "object" || payload === null) return false;

  const { pathname, clientPayload, multipart } = payload as {
    pathname?: unknown;
    clientPayload?: unknown;
    multipart?: unknown;
  };
  return (
    typeof pathname === "string" &&
    pathname !== "" &&
    (clientPayload === undefined || clientPayload === null || typeof clientPayload === "string") &&
    (multipart === undefined || typeof multipart === "boolean")
  );
}

/**
 * แกะ `clientPayload` (สตริง JSON ที่เบราว์เซอร์แนบมา) ให้เป็น object
 *
 * - ไม่ได้ส่งมา → `{}` เหมือนพฤติกรรมเดิม (`JSON.parse(clientPayload ?? "{}")`)
 *   ให้ด่านถัดไปตัดสินเองว่าขาดอะไร
 * - parse ไม่ได้ หรือได้ค่าที่ไม่ใช่ object (`null`, ตัวเลข, array) → `null`
 *   ⚠️ เดิม `JSON.parse("null").code` โยน TypeError กลายเป็น 500
 */
export function parseClientPayload(raw: string | null | undefined): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
