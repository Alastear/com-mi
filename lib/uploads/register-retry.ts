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
import { settleWithin } from "./settle-within";

/**
 * คำขอที่ถูก claim ไว้นานเกินนี้แล้วยังไม่มีแถว `media` = การเรียกที่ถือไว้ตายไปแล้ว
 * `registerDeliveryFile` claim ต่อได้ (lib/uploads/intent.ts `claimIntent`)
 *
 * กรณีที่ต้องใช้: เรียกครั้งแรก claim ได้แล้ว Neon ล่มต่อจากนั้น — ทั้งงานบันทึกและ
 * `releaseIntent` ล้มกับ DB ตัวเดียวกัน คำขอค้างเป็น "ใช้แล้ว" ทั้งที่ไม่มีใครถืออยู่จริง
 * หรือ function ถูกฆ่ากลางทาง (หมดเวลา เครื่องล่ม) ก่อนถึงบรรทัดคืนสิทธิ์
 * เดิมคำขอแบบนี้ตายถาวร ครีเอเตอร์ต้องอัปไฟล์ 2 GB ใหม่
 *
 * ⚠️ ต้องนานกว่าที่ function หนึ่งตัวมีชีวิตได้ ไม่งั้นสองการเรียกถือคำขอพร้อมกัน
 * แล้วฝั่งหนึ่งอาจลบไฟล์ (discard) ขณะอีกฝั่งกำลัง insert แถวที่ชี้ไฟล์นั้น
 * Vercel ยอมให้ function วิ่งได้ไม่เกิน 900 วินาทีในทุกแพ็ก (ค่าตั้งต้น 300) — เผื่อไว้เป็น 16 นาที
 * ถ้าวันหนึ่งตั้ง `maxDuration` เกินนี้ ต้องขยับค่านี้ตาม
 */
export const STALE_CLAIM_MS = 16 * 60 * 1000;

/**
 * ลองต่อได้นานเท่าไร — นับเฉพาะเวลาที่เบราว์เซอร์ออนไลน์อยู่
 * ช่วงออฟไลน์ไม่นับ (ลองตอนเน็ตไม่มีก็ล้มทุกครั้ง เสียรอบเปล่า) แต่ยังไม่เกินอายุคำขอ
 *
 * ⚠️ ต้องนานกว่า `STALE_CLAIM_MS` บวกช่วงรอยาวสุด (30 วินาที) — กรณีที่แย่ที่สุด
 * (claim แล้วคืนสิทธิ์ไม่ได้) เซิร์ฟเวอร์ตอบ `busy` จนครบ `STALE_CLAIM_MS` แล้วถึงบันทึกต่อได้
 * หน้าต่างสั้นกว่านั้นคือเลิกลองก่อนจะสำเร็จพอดี มีเทสต์คุมไว้
 */
export const REGISTER_RETRY_WINDOW_MS = 20 * 60 * 1000;

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
 *     `retry` = ครั้งนี้ claim ได้แล้วล้มกลางทาง (คืนสิทธิ์แล้ว หรือคืนไม่ได้แต่จะ claim ต่อได้เมื่อค้างครบ `STALE_CLAIM_MS`)
 *     `busy`  = อีกการเรียกหนึ่งถือคำขออยู่ (ครั้งก่อนที่โยน/คำตอบหาย อาจยังวิ่งอยู่ หรือตายไปแล้ว)
 * - `hard`  ล้มถาวร ลองอีกกี่ครั้งก็ได้ผลเดิม
 *
 * ⚠️ `forbidden` เป็นล้มถาวรเสมอ — เซิร์ฟเวอร์แยก "มีคนถือคำขออยู่" (`busy`) ออกมาให้แล้ว
 * เดิมเดาเอาว่า `forbidden` หลังครั้งที่โยนคือ "ครั้งก่อนยังถืออยู่" แล้วลองต่อสิบนาที
 * กับคำขอที่ตายไปแล้ว ก่อนจะขึ้นว่า "ไฟล์ยังไม่หาย" ทั้งที่หายตั้งแต่แรก
 */
export function classifyRegisterResult(res: RegisterCallResult): "done" | "retry" | "hard" {
  if (res.ok) return "done";
  if (res.error === "retry" || res.error === "busy") return "retry";
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
  /** A lost/hung response must leave a recoverable intent, not a spinning UI forever. */
  callTimeoutMs?: number;
}): Promise<R | Unconfirmed> {
  const started = deps.now();
  let offlineMs = 0;
  deps.onStatus?.("saving");

  for (let attempt = 1; ; attempt++) {
    let verdict: "done" | "retry" | "hard";
    let res: R | null = null;
    try {
      const settled = await settleWithin(deps.call, deps.callTimeoutMs ?? 60_000);
      if (!settled.done) return { ok: false, error: "unconfirmed" };
      res = settled.value;
      verdict = classifyRegisterResult(res);
    } catch {
      /**
       * action เองล้ม — อาจไปไม่ถึงเซิร์ฟเวอร์ หรือไปถึงแล้วคำตอบหาย ไม่รู้ว่าแบบไหน
       * ลองซ้ำได้เสมอ: ถ้าครั้งนี้ยังถือคำขออยู่ ครั้งถัดไปได้ `busy` (ไม่ใช่ `forbidden`)
       */
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
