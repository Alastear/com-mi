/**
 * แปลงรหัสความล้มเหลวของการอัปโหลดเป็นเรื่องที่ผู้ใช้ต้องรู้ และกติกาการลองซ้ำ
 *
 * ⚠️ เป็นไฟล์บริสุทธิ์ ห้าม import "server-only" หรือ DB — มีเทสต์ด้วย node:test
 * และใช้ทั้งในเบราว์เซอร์ (lib/uploads/client.ts, components/*uploader*) ด้วย
 */

/**
 * เรื่องที่ต้องบอกผู้ใช้ — แต่ละหน้าจอเลือกข้อความจาก dictionary ของตัวเองตามค่านี้
 *
 * เดิมแต่ละหน้าจอเทียบรหัสเองคนละแบบ `rate_limited` จึงตกไปเป็น "ลองใหม่อีกครั้ง"
 * ทุกที่ ทั้งที่ลองใหม่คือสิ่งเดียวที่ไม่ได้ผลไปอีกเป็นชั่วโมง
 */
export type UploadFailure =
  | "quota"
  | "too_large"
  | "rate_limited"
  | "invalid_state"
  | "empty"
  | "failed";

export function uploadFailure(code: string): UploadFailure {
  switch (code) {
    case "storage_quota_exceeded":
      return "quota";
    case "too_large":
      return "too_large";
    case "rate_limited":
      return "rate_limited";
    case "invalid_state":
      return "invalid_state";
    case "empty_file":
      return "empty";
    default:
      return "failed";
  }
}

/**
 * ไฟล์ที่เหลือในชุดเดียวกันจะล้มด้วยเหตุเดียวกันแน่นอน — หยุดทั้งชุดแล้วบอกว่าข้ามไปกี่ไฟล์
 * ส่วนเหตุเฉพาะไฟล์ (ใหญ่ไป ไฟล์ว่าง เน็ตหลุด) ไปต่อไฟล์ถัดไปได้
 */
export function stopsBatch(f: UploadFailure): boolean {
  return f === "quota" || f === "rate_limited" || f === "invalid_state";
}

/* ── การลองซ้ำของชิ้นไฟล์ส่งมอบ ─────────────────────────────────── */

/**
 * ลองส่งชิ้นเดียวได้กี่ครั้ง — รอรวมราวสองนาทีครึ่ง (ไม่นับเวลาที่รอเน็ตกลับมา)
 *
 * เดิมสามครั้ง รอ 1 กับ 2 วินาที เน็ตมือถือหลุดสี่วินาทีตอนอัปไปแล้ว 1.4 GB
 * ก็พอให้ทั้งไฟล์ล้ม และยังไม่มีการอัปต่อจากที่ค้าง — ต้องเริ่มใหม่ตั้งแต่ชิ้นแรก
 */
export const MAX_PART_ATTEMPTS = 10;

/** รอก่อนลองครั้งที่ `attempt + 1` — 1, 2, 4, 8, 16 วินาที แล้วคงที่ 30 วินาที */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

/**
 * R2 ตอบสถานะนี้แล้วลองซ้ำมีโอกาสผ่านไหม
 * 5xx, 408 (หมดเวลา), 429 (ถี่ไป) ใช่ — 4xx อื่น (URL หมดอายุ ขนาดไม่ตรง) ลองกี่ครั้งก็เหมือนเดิม
 */
export function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}
