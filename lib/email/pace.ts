/**
 * คุมจังหวะการยิง Resend — ไม่แตะ Resend เอง ทดสอบได้ด้วยนาฬิกาปลอม
 *
 * ทำไมต้องมี: `notify()` ส่งอีเมลใน `after()` และ Next รัน callback ของ `after()` ทุกตัว
 * **พร้อมกัน** ตอนส่ง response เสร็จ (PQueue ไม่จำกัด concurrency) cron ที่เตือน "จะปิดงานอัตโนมัติ"
 * สิบใบในรอบเดียวจึงยิง Resend สิบครั้งในเสี้ยววินาที แต่ Resend จำกัดทั้งทีมไว้ราว 2 ครั้ง/วินาที
 * ส่วนที่เกินได้ 429 — และคำเตือนถูกจดใน DB ไปแล้ว อีกสองวันงานปิดเองทั้งที่ลูกค้าไม่เคยได้อีเมล
 *
 * แก้สองชั้น:
 *   1. ในเครื่องเดียวกัน เว้นระยะทุกการยิงอย่างน้อย `EMAIL_GAP_MS` (ต่อคิวกัน ไม่ใช่ยิงพร้อมกัน)
 *   2. ข้ามเครื่อง (อีก instance ยิงพร้อมเรา) กันไม่ได้จากตรงนี้ — ได้ 429 ก็รอแล้วลองใหม่ไม่กี่ครั้ง
 */

/** เว้นระยะระหว่างการยิงในเครื่องเดียวกัน — ต่ำกว่าเพดาน 2 ครั้ง/วินาทีของ Resend พอสมควร */
export const EMAIL_GAP_MS = 600;

/** ลองซ้ำได้กี่ครั้งเมื่อโดน 429 (ไม่นับครั้งแรก) */
export const RATE_LIMIT_RETRIES = 2;

/** รอนานสุดต่อครั้ง — `retry-after` ที่ยาวผิดปกติต้องไม่ลากให้ `after()` เกินเวลาของ function */
const MAX_RETRY_WAIT_MS = 5_000;

/**
 * คิวจองเวลายิง: ทุกคนที่เรียก `wait()` ได้ช่องเวลาของตัวเอง ห่างจากช่องก่อนหน้าอย่างน้อย `gapMs`
 *
 * จองช่อง **ก่อน** รอ (ไม่ใช่รอแล้วค่อยดูเวลา) — ห้าคนเรียกพร้อมกันจึงได้ห้าช่องเรียงกัน
 * ไม่ใช่ห้าคนตื่นพร้อมกันแล้วยิงพร้อมกันอีกรอบ
 */
export function createPacer(opts: {
  gapMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): { wait: () => Promise<void> } {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastSlot = -Infinity;
  return {
    async wait() {
      const t = now();
      const slot = Math.max(t, lastSlot + opts.gapMs);
      lastSlot = slot;
      if (slot > t) await sleep(slot - t);
    },
  };
}

/**
 * รอนานแค่ไหนก่อนลองใหม่หลังได้ 429 — null = ไม่ลองแล้ว
 *
 * เชื่อ `retry-after` (วินาที) ของ Resend ถ้ามี ไม่มี/อ่านไม่ออก = ถอยแบบทวีคูณจาก 1 วินาที
 * `attempt` = ลองซ้ำครั้งที่เท่าไร เริ่มที่ 1
 */
export function rateLimitDelayMs(attempt: number, retryAfter: string | null | undefined): number | null {
  if (attempt > RATE_LIMIT_RETRIES) return null;
  const seconds = retryAfter == null ? NaN : Number(retryAfter.trim());
  const base = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000 * 2 ** (attempt - 1);
  return Math.min(MAX_RETRY_WAIT_MS, Math.max(EMAIL_GAP_MS, base));
}
