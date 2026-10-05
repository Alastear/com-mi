import type { PublicMediaKind } from "@/lib/media/kinds";
import { registerDeliveryFile, type RegisterDeliveryResult } from "@/lib/delivery/register";
import { clampFilename, partPlan } from "@/lib/storage/keys";
import { cancelUpload, startDeliveryUpload, startMediaUpload } from "./actions";
import { isRetryableStatus, MAX_PART_ATTEMPTS, retryDelayMs } from "./errors";
import { registerWithRetry, type RegisterStatus, type Unconfirmed } from "./register-retry";

/**
 * ฝั่งเบราว์เซอร์ของการอัปโหลด — ขอ URL จากเซิร์ฟเวอร์ แล้ว PUT ตรงไป R2
 *
 * ความล้มเหลวทุกแบบโยนเป็น `Error(<รหัส>)` รหัสมาจาก `StartUploadError`
 * หรือ `put_<status>` เมื่อ R2 ปฏิเสธ หรือ `empty_file` — ผู้เรียกแปลงด้วย `uploadFailure()`
 * (lib/uploads/errors.ts) แล้วเลือกข้อความให้ผู้ใช้
 *
 * ⚠️ ห้าม import "server-only" — ไฟล์นี้วิ่งในเบราว์เซอร์
 */

/** อัปรูป/วิดีโอสาธารณะหนึ่งไฟล์ — คืน id ของคำขอ เอาไปส่งให้ `registerMedia` */
export async function uploadPublic(
  kind: PublicMediaKind,
  body: Blob,
  contentType: string,
): Promise<string> {
  const start = await startMediaUpload({ kind, contentType, bytes: body.size });
  if (!start.ok) throw new Error(start.error);

  // header ต้องตรงกับที่เซ็นไว้ทุกตัว (ชนิดไฟล์ cache-control และห้ามเขียนทับ)
  let res: Response;
  try {
    res = await fetch(start.url, { method: "PUT", headers: start.headers, body });
  } catch (err) {
    // คืนพื้นที่ที่จองไว้ทันที ไม่ต้องรอคำขอหมดอายุ (best-effort — เน็ตหลุดก็เรียกไม่ถึง)
    void cancelUpload(start.intentId).catch(() => {});
    throw err;
  }
  if (!res.ok) {
    void cancelUpload(start.intentId).catch(() => {});
    throw new Error(`put_${res.status}`);
  }
  return start.intentId;
}

export type DeliveryUpload = {
  intentId: string;
  parts: Array<{ partNumber: number; etag: string }>;
  /**
   * คำขอหมดอายุเมื่อไร ตามนาฬิกาเครื่องนี้ — คิดจากเวลา **ก่อน** ส่งคำขอ บวกอายุที่เซิร์ฟเวอร์บอก
   * จึงเร็วกว่าของจริงเสมอ (ปลอดภัยไว้ก่อน) และไม่ขึ้นกับนาฬิกาเครื่องที่อาจเพี้ยน
   */
  expiresAt: number;
};

/**
 * อัปไฟล์ส่งมอบเป็นชิ้น ๆ พร้อมกันทีละ 4 ชิ้น
 *
 * ชิ้นที่ล้มด้วยปัญหาเน็ตหรือ R2 ตอบ 5xx ลองใหม่ได้หลายครั้ง (รอเน็ตกลับมาก่อนถ้าออฟไลน์)
 * ส่วน 4xx ไม่ลองซ้ำ — URL หมดอายุหรือขนาดไม่ตรง ลองกี่ครั้งก็ได้ผลเดิม
 *
 * ⚠️ ชิ้นแรกที่ล้มจนหมดโควตา = ทั้งไฟล์ล้ม และต้อง **หยุดทุก worker ทันที**
 * เดิม `Promise.all` reject แล้วแต่ worker อีกสามตัวยังดึงชิ้นถัดไปส่งต่อ (จำลองแล้ว 69 ชิ้น
 * หลังล้ม) กินเน็ตมือถือของครีเอเตอร์ ส่งเข้า upload ที่จะไม่มีวันถูกบันทึก และเรียก
 * `onProgress` ทับตัวเลขของการลองใหม่รอบถัดไปจนเปอร์เซ็นต์กระโดดไปมา
 * ตอนนี้ใช้ `AbortController` ร่วมกัน: ล้มชิ้นเดียว ทุก fetch ที่ค้างถูกยกเลิก ไม่หยิบชิ้นใหม่
 * ไม่เรียก `onProgress` อีก แล้วค่อยโยน (หลัง worker ทุกตัวหยุดจริงแล้ว)
 */
export async function uploadDelivery(
  code: string,
  file: File,
  onProgress?: (fraction: number) => void,
  kind: "final" | "wip" = "final",
): Promise<DeliveryUpload> {
  // ไฟล์ 0 ไบต์ประกอบเป็น multipart ไม่ได้ (ต้องมีอย่างน้อยหนึ่งชิ้น) — บอกให้ตรงเรื่องแทน "ลองใหม่"
  if (file.size === 0) throw new Error("empty_file");

  const requestedAt = Date.now();
  const start = await startDeliveryUpload({
    kind,
    code,
    // เซิร์ฟเวอร์รับชื่อไม่เกิน 200 ตัว — ตัดเองโดยเก็บนามสกุลไว้ ลูกค้าจะได้เปิดไฟล์ได้
    filename: clampFilename(file.name),
    contentType: file.type,
    bytes: file.size,
  });
  if (!start.ok) throw new Error(start.error);

  // ต้องตัดด้วยกฎเดียวกับฝั่งเซิร์ฟเวอร์ — ขนาดของทุกชิ้นถูกเซ็นลงใน URL ของมัน
  const sizes = partPlan(file.size, start.partSize);
  if (sizes.length !== start.urls.length) {
    void cancelUpload(start.intentId).catch(() => {});
    throw new Error("upload_failed");
  }

  const abort = new AbortController();
  let failure: unknown = null;
  const parts: DeliveryUpload["parts"] = [];
  let next = 0;
  let sent = 0;

  const worker = async () => {
    while (failure === null && next < sizes.length) {
      const i = next++;
      const from = i * start.partSize;
      try {
        const etag = await putPart(start.urls[i], file.slice(from, from + sizes[i]), abort.signal);
        if (failure !== null) return;
        parts.push({ partNumber: i + 1, etag });
        sent += sizes[i];
        onProgress?.(sent / file.size);
      } catch (err) {
        if (failure === null) {
          failure = err;
          abort.abort();
        }
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, sizes.length) }, worker));

  if (failure !== null) {
    // คืนพื้นที่ที่จองไว้และทิ้งชิ้นที่ส่งไปแล้ว — ไม่งั้นติดโควตาจนคำขอหมดอายุ
    void cancelUpload(start.intentId).catch(() => {});
    throw failure instanceof Error ? failure : new Error("upload_failed");
  }
  return { intentId: start.intentId, parts, expiresAt: requestedAt + start.expiresInMs };
}

/**
 * บันทึกไฟล์ส่งมอบที่อัปครบแล้ว — ลองซ้ำเป็นนาทีเมื่อเน็ตหลุดหรือเซิร์ฟเวอร์สะดุดชั่วคราว
 *
 * ไฟล์ 2 GB อัปเสร็จแล้ว อย่าให้การบันทึกที่ล้มชั่วคราวทำให้ต้องอัปใหม่ทั้งไฟล์
 * `registerDeliveryFile` เรียกซ้ำได้ปลอดภัย (ได้แถวเดิม ไม่ได้แถวที่สอง)
 * กติกาเต็ม (นานแค่ไหน อะไรนับว่าชั่วคราว) อยู่ที่ lib/uploads/register-retry.ts
 *
 * ⚠️ `cancelUpload` เฉพาะเมื่อล้มถาวรเท่านั้น — หมดรอบลองซ้ำได้ `unconfirmed`
 * แล้วคำขอถูกปล่อยไว้ (ยังจองพื้นที่ ชิ้น/ไฟล์ที่ประกอบแล้วยังอยู่) เรียกฟังก์ชันนี้ซ้ำด้วย `up`
 * เดิมได้จนกว่าคำขอจะหมดอายุ หลังจากนั้นงานเก็บกวาดคืนพื้นที่และลบให้ (lib/media/cleanup.ts)
 * เดิมยกเลิกทันทีหลังลองสี่ครั้งในเจ็ดวินาที ไฟล์ที่ประกอบเสร็จแล้วถูกลบทิ้งเพราะ Neon สะดุดครู่เดียว
 */
export async function registerDelivery(
  up: DeliveryUpload,
  onStatus?: (s: RegisterStatus) => void,
): Promise<RegisterDeliveryResult | Unconfirmed> {
  return registerWithRetry({
    // ส่งแค่สองช่องที่ action ต้องใช้ — ไม่ส่งเวลาหมดอายุของเครื่องนี้ไปให้เซิร์ฟเวอร์เชื่อ
    call: () => registerDeliveryFile({ intentId: up.intentId, parts: up.parts }),
    now: Date.now,
    sleep: (ms) => sleep(ms),
    isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
    waitOnline,
    expiresAt: up.expiresAt,
    onHardFailure: () => void cancelUpload(up.intentId).catch(() => {}),
    onStatus,
  });
}

async function putPart(url: string, chunk: Blob, signal: AbortSignal): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, { method: "PUT", body: chunk, signal });
    } catch (err) {
      if (signal.aborted || attempt >= MAX_PART_ATTEMPTS) throw err;
    }
    if (res?.ok) {
      // อ่านได้เพราะ CORS ของถังตั้ง ExposeHeaders: ETag ไว้ — ไม่มีก็ประกอบไฟล์ไม่ได้
      const etag = res.headers.get("etag");
      if (!etag) throw new Error("upload_failed");
      return etag;
    }
    if (res && (!isRetryableStatus(res.status) || attempt >= MAX_PART_ATTEMPTS)) {
      throw new Error(`put_${res.status}`);
    }
    await waitToRetry(attempt, signal);
  }
}

/**
 * รอก่อนลองใหม่ — ถ้าเบราว์เซอร์รู้ว่าออฟไลน์อยู่ รอจนเน็ตกลับมาก่อน (ไม่เกิน 15 นาที)
 * ไม่งั้นทุกรอบของการลองซ้ำล้มทันทีตอนเน็ตยังไม่มา แล้วหมดโควตาในไม่กี่วินาที
 * ⚠️ ถูกยกเลิกได้ — ชิ้นอื่นล้มแล้วต้องไม่มีใครนั่งรอต่อ
 */
async function waitToRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  await sleep(retryDelayMs(attempt), signal);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await waitOnline(15 * 60 * 1000, signal);
  }
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
}

/** รอจนเบราว์เซอร์กลับมาออนไลน์ ไม่เกิน `maxMs` (หรือจนถูกยกเลิก) */
function waitOnline(maxMs: number, signal?: AbortSignal): Promise<void> {
  if (typeof window === "undefined" || navigator.onLine !== false) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener("online", done);
      signal?.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    window.addEventListener("online", done);
    signal?.addEventListener("abort", done);
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done);
  });
}
