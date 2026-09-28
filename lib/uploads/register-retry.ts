/**
 * กติกาการลองบันทึกไฟล์ส่งมอบซ้ำ (หลังอัปครบทุกชิ้นแล้ว)
 *
 * ⚠️ เป็นไฟล์บริสุทธิ์ ห้าม import "server-only", Server Action หรือ DB — มีเทสต์ด้วย node:test
 * เวลา การรอ และการเรียก action ถูกส่งเข้ามาทั้งหมด (lib/uploads/client.ts เป็นคนต่อสาย)
 *
 * เดิมลองแค่ 4 ครั้งในราว 7 วินาที แล้วเรียก `cancelUpload` ซึ่งลบไฟล์ที่ประกอบเสร็จแล้วทิ้ง
 * Neon หรือ R2 สะดุดสิบวินาทีก็พอให้ครีเอเตอร์ต้องอัปไฟล์ 2 GB ใหม่ทั้งไฟล์
 * ตอนนี้ลองต่อเป็นนาที และ **ไม่ทิ้งอะไรเลยเมื่อหมดรอบ** — คำขอยังอยู่ ยังจองพื้นที่อยู่
 * กดบันทึกอีกครั้งได้จนกว่าจะหมดอายุ แล้วงานเก็บกวาดค่อยคืนพื้นที่และลบชิ้นให้เอง
 */

import { retryDelayMs } from "./errors";

/**
 * ลองต่อได้นานเท่าไร — นับเฉพาะเวลาที่เบราว์เซอร์ออนไลน์อยู่
 * ช่วงออฟไลน์ไม่นับ (ลองตอนเน็ตไม่มีก็ล้มทุกครั้ง เสียรอบเปล่า) แต่ยังไม่เกินอายุคำขอ
 */
export const REGISTER_RETRY_WINDOW_MS = 10 * 60 * 1000;

/**
 * เผื่อก่อนคำขอหมดอายุ — นาฬิกาเครื่องผู้ใช้กับเซิร์ฟเวอร์ไม่ตรงกันเป๊ะ และคำขอหนึ่งครั้ง
 * (ประกอบไฟล์ 2 GB บน R2) ใช้เวลาได้หลายวินาที ลองชิดเส้นเกินไปจะได้ `forbidden` แทน
 */
export const INTENT_SAFETY_MS = 2 * 60 * 1000;

/** ผลจาก `registerDeliveryFile` ในรูปที่กติกานี้ต้องรู้ */
export type RegisterCallResult = { ok: true } | { ok: false; error: string };

/**
 * ผลของการเรียกหนึ่งครั้ง
 * - `done`  บันทึกแล้ว (รวมกรณีรอบก่อนสำเร็จแต่คำตอบหาย — ได้แถวเดิมคืน)
 * - `retry` ล้มชั่วคราว คำขอยังใช้ได้ ลองซ้ำด้วยค่าเดิม
 * - `hard`  ล้มถาวร ลองอีกกี่ครั้งก็ได้ผลเดิม
 *
 * `uncertain` = เคยมีครั้งก่อนหน้าที่ action โยน (เน็ตหลุดระหว่างทาง / Next ซ่อนข้อความ)
 * ⚠️ ครั้งนั้นอาจยังวิ่งอยู่ที่เซิร์ฟเวอร์และถือคำขอไว้ ครั้งถัดไป claim ไม่ได้จึงได้ `forbidden`
 * ทั้งที่อีกไม่กี่วินาทีครั้งแรกจะบันทึกเสร็จ (ลองซ้ำได้ id เดิม) หรือคืนสิทธิ์ (ลองซ้ำผ่าน)
 * นับ `forbidden` หลังความไม่แน่นอนเป็นชั่วคราว ไม่ใช่บอกว่าไฟล์ใช้ไม่ได้แล้ว
 */
export function classifyRegisterResult(
  res: RegisterCallResult,
  uncertain: boolean,
): "done" | "retry" | "hard" {
  if (res.ok) return "done";
  if (res.error === "retry") return "retry";
  if (res.error === "forbidden" && uncertain) return "retry";
  return "hard";
}

/**
 * รอเท่าไรก่อนลองครั้งถัดไป — `null` = หยุดลอง
 *
 * backoff เดียวกับชิ้นไฟล์ (1, 2, 4, 8, 16 วินาที แล้วคงที่ 30) หยุดเมื่อรอบถัดไปจะเกิน
 * หน้าต่างเวลาที่ออนไลน์ หรือจะชิดวันหมดอายุของคำขอเกินระยะเผื่อ
 */
export function nextRegisterDelay(input: {
  /** ครั้งที่เพิ่งล้ม เริ่มที่ 1 */
  attempt: number;
  /** เวลาที่ใช้ไปแล้วตอนออนไลน์ นับจากครั้งแรก */
  activeMs: number;
  /** เหลือเวลาอีกเท่าไรก่อนคำขอหมดอายุ (นาฬิกาเครื่องผู้ใช้) */
  msUntilExpiry: number;
}): number | null {
  const delay = retryDelayMs(input.attempt);
  if (input.activeMs + delay > REGISTER_RETRY_WINDOW_MS) return null;
  if (input.msUntilExpiry - delay < INTENT_SAFETY_MS) return null;
  return delay;
}

/** สิ่งที่หน้าจอควรบอกระหว่างรอ — แผงส่งมอบต้องไม่นิ่งเงียบตอนกำลังลองซ้ำเป็นนาที */
export type RegisterStatus = "saving" | "retrying" | "offline";

/**
 * หมดรอบแล้วแต่ยังไม่รู้ผลแน่ — **ไม่ใช่ไฟล์หาย**
 * คำขอยังไม่ถูกยกเลิก: อาจบันทึกไปแล้ว (คำตอบหาย) หรือกดบันทึกอีกครั้งได้โดยไม่ต้องอัปใหม่
 */
export type Unconfirmed = { ok: false; error: "unconfirmed" };

export async function registerWithRetry<R extends RegisterCallResult>(deps: {
  call: () => Promise<R>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  isOnline: () => boolean;
  /** รอจนออนไลน์ แต่ไม่เกิน `maxMs` */
  waitOnline: (maxMs: number) => Promise<void>;
  /** เวลาหมดอายุของคำขอ ตามนาฬิกาเครื่องผู้ใช้ (คิดแบบระวังไว้ก่อนแล้ว) */
  expiresAt: number;
  /** เรียกเฉพาะเมื่อล้มถาวร — ผู้เรียกใช้คืนพื้นที่ที่จองไว้ */
  onHardFailure: () => void;
  onStatus?: (s: RegisterStatus) => void;
}): Promise<R | Unconfirmed> {
  const started = deps.now();
  let offlineMs = 0;
  let uncertain = false;
  deps.onStatus?.("saving");

  for (let attempt = 1; ; attempt++) {
    let verdict: "done" | "retry" | "hard";
    let res: R | null = null;
    try {
      res = await deps.call();
      verdict = classifyRegisterResult(res, uncertain);
    } catch {
      // action เองล้ม — อาจไปไม่ถึงเซิร์ฟเวอร์ หรือไปถึงแล้วคำตอบหาย ไม่รู้ว่าแบบไหน
      uncertain = true;
      verdict = "retry";
    }
    if (verdict === "done") return res as R;
    if (verdict === "hard") {
      deps.onHardFailure();
      return res as R;
    }

    const now = deps.now();
    const delay = nextRegisterDelay({
      attempt,
      activeMs: now - started - offlineMs,
      msUntilExpiry: deps.expiresAt - now,
    });
    // ⚠️ หมดรอบแล้ว **ห้ามยกเลิกคำขอ** — ไฟล์ที่ประกอบแล้วจะถูกลบทิ้ง ทั้งที่อาจบันทึกได้ในอีกไม่กี่นาที
    if (delay === null) return { ok: false, error: "unconfirmed" };

    if (!deps.isOnline()) {
      deps.onStatus?.("offline");
      const from = deps.now();
      await deps.waitOnline(Math.max(0, deps.expiresAt - INTENT_SAFETY_MS - from));
      offlineMs += deps.now() - from;
    }
    deps.onStatus?.("retrying");
    await deps.sleep(delay);
  }
}
