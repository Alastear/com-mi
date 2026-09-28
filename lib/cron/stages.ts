/**
 * cron รายวัน (app/api/cron/cleanup) รันขั้นไหนบ้าง — แยกออกมาจาก route ให้ทดสอบได้โดยไม่มี DB
 *
 *   media     — เก็บกวาดไฟล์ที่ไม่มีใครใช้ (lib/media/cleanup.ts) **ทั้งระบบ** ไม่มีทางจำกัดขอบเขต
 *   lifecycle — วงจรชีวิตออเดอร์ (lib/orders/lifecycle-run.ts) จำกัดด้วย `?code=` ได้
 */
export type Stage = "media" | "lifecycle";
export const STAGES: readonly Stage[] = ["media", "lifecycle"];

export type StagePlan = { ok: true; stages: Stage[] } | { ok: false; error: "bad_stage" | "media_not_scoped" };

/**
 * `?code=` = คนเรียกตั้งใจทดสอบเฉพาะออเดอร์ของตัวเอง — ขั้น media จึงไม่รันเลย
 *
 * ⚠️ `?code=...&only=media` ต้องปฏิเสธ ไม่ใช่ปล่อยให้ `only` ชนะ: เดิมเช็ก `only` ก่อน
 * คำขอที่ดูเหมือน "ทดสอบเฉพาะจุด" จึงไปรันเก็บกวาดไฟล์ของผู้ใช้จริงทุกคนบน DB ตัวเดียวกับ production
 * และห้ามเงียบ ๆ ให้ "ไม่รันอะไร" แทน — คนเรียกจะคิดว่ารันแล้วไม่เจออะไร
 * แม้ `dry=1` ก็ปฏิเสธ: กติกาเดียวง่ายกว่า และ media แบบ dry ไม่ต้องใช้ code อยู่แล้ว
 */
export function planStages(only: string | null, hasCodes: boolean): StagePlan {
  if (only !== null && !STAGES.includes(only as Stage)) return { ok: false, error: "bad_stage" };
  if (only === "media" && hasCodes) return { ok: false, error: "media_not_scoped" };
  if (only !== null) return { ok: true, stages: [only as Stage] };
  return { ok: true, stages: hasCodes ? ["lifecycle"] : [...STAGES] };
}
