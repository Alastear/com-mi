/**
 * ผลผิดพลาดของ route ออก token อัปโหลด — ใช้ร่วมกันทั้ง /api/blob/upload และ /api/blob/delivery-upload
 *
 * ⚠️ ห้ามส่งข้อความดิบจาก SDK/DB ออกไปถึงเบราว์เซอร์ — ข้อความจาก SDK เคยมี pathname ของ blob อื่น
 * ติดมาด้วย ตอบได้เฉพาะรหัสในชุดนี้ ข้อความจริง log ไว้ฝั่งเรา
 *
 * ⚠️ 500 สงวนไว้ให้ความล้มเหลวของฝั่งเราจริง ๆ เท่านั้น (Blob, DB, env หาย) —
 * body เพี้ยนหรือไม่มีสิทธิ์เป็นความผิดของผู้เรียก ต้องได้ 4xx ไม่งั้นบอตที่ยิงขยะเข้ามา
 * จะทำให้ log/alert ของ 500 ดูเหมือน Blob ล่ม ทั้งที่ไม่มีอะไรพัง
 * กลับกัน ห้ามเหมารวมทุกอย่างเป็น 400 — Blob ล่มจริงจะกลายเป็น "ผู้ใช้ส่งมาผิด" แล้วไม่มีใครเห็น
 *
 * ⚠️ เป็นไฟล์บริสุทธิ์ ห้าม import "server-only" หรือ DB — มีเทสต์ด้วย node:test
 */

export type UploadError =
  | "bad_request"
  | "forbidden"
  | "invalid_state"
  | "storage_quota_exceeded"
  | "upload_failed";

const STATUS: Record<UploadError, number> = {
  bad_request: 400,
  forbidden: 403,
  invalid_state: 403,
  storage_quota_exceeded: 403,
  upload_failed: 500,
};

/**
 * แปลง error ที่จับได้เป็นรหัสที่ตอบได้
 *
 * ใน `onBeforeGenerateToken` เราโยน `new Error("<รหัส>")` เอง — ข้อความที่ตรงกับรหัสในชุดนี้พอดี
 * คือของเรา อย่างอื่นทั้งหมด (SDK, DB, env) ถือเป็นความล้มเหลวของระบบ = `upload_failed`
 *
 * ⚠️ `Object.hasOwn` ไม่ใช่ `in` — `"toString" in STATUS` เป็นจริง ข้อความแปลก ๆ จะหลุดผ่านได้
 */
export function toUploadError(err: unknown): UploadError {
  const raw = err instanceof Error ? err.message : "";
  return Object.hasOwn(STATUS, raw) ? (raw as UploadError) : "upload_failed";
}

export function uploadErrorStatus(error: UploadError): number {
  return STATUS[error];
}

export function uploadErrorResponse(error: UploadError): Response {
  return Response.json({ error }, { status: STATUS[error] });
}
