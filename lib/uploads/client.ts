import type { PublicMediaKind } from "@/lib/media/kinds";
import { partPlan } from "@/lib/storage/keys";
import { startDeliveryUpload, startMediaUpload } from "./actions";

/**
 * ฝั่งเบราว์เซอร์ของการอัปโหลด — ขอ URL จากเซิร์ฟเวอร์ แล้ว PUT ตรงไป R2
 *
 * ความล้มเหลวทุกแบบโยนเป็น `Error(<รหัส>)` รหัสมาจาก `StartUploadError`
 * หรือ `put_<status>` เมื่อ R2 ปฏิเสธ — ผู้เรียกเลือกข้อความให้ผู้ใช้จากรหัสนี้
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
  const res = await fetch(start.url, { method: "PUT", headers: start.headers, body });
  if (!res.ok) throw new Error(`put_${res.status}`);
  return start.intentId;
}

/**
 * อัปไฟล์ส่งมอบเป็นชิ้น ๆ พร้อมกันทีละ 4 ชิ้น
 *
 * ชิ้นที่ล้มด้วยปัญหาเน็ต (fetch โยน) หรือ R2 ตอบ 5xx ลองใหม่ได้อีกสองครั้ง
 * ส่วน 4xx ไม่ลองซ้ำ — URL หมดอายุหรือขนาดไม่ตรง ลองกี่ครั้งก็ได้ผลเดิม
 */
export async function uploadDelivery(
  code: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<{ intentId: string; parts: Array<{ partNumber: number; etag: string }> }> {
  const start = await startDeliveryUpload({
    code,
    // เซิร์ฟเวอร์รับชื่อไม่เกิน 200 ตัว — ตัดเองดีกว่าให้ทั้งไฟล์ถูกปฏิเสธเพราะชื่อยาว
    filename: file.name.slice(0, 200),
    contentType: file.type,
    bytes: file.size,
  });
  if (!start.ok) throw new Error(start.error);

  // ต้องตัดด้วยกฎเดียวกับฝั่งเซิร์ฟเวอร์ — ขนาดของทุกชิ้นถูกเซ็นลงใน URL ของมัน
  const sizes = partPlan(file.size, start.partSize);
  if (sizes.length !== start.urls.length) throw new Error("upload_failed");

  const parts: Array<{ partNumber: number; etag: string }> = [];
  let next = 0;
  let sent = 0;
  const worker = async () => {
    while (next < sizes.length) {
      const i = next++;
      const from = i * start.partSize;
      const etag = await putPart(start.urls[i], file.slice(from, from + sizes[i]));
      parts.push({ partNumber: i + 1, etag });
      sent += sizes[i];
      onProgress?.(sent / file.size);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, sizes.length) }, worker));
  return { intentId: start.intentId, parts };
}

async function putPart(url: string, chunk: Blob): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, { method: "PUT", body: chunk });
    } catch (err) {
      if (attempt >= 3) throw err;
    }
    if (res?.ok) {
      // อ่านได้เพราะ CORS ของถังตั้ง ExposeHeaders: ETag ไว้ — ไม่มีก็ประกอบไฟล์ไม่ได้
      const etag = res.headers.get("etag");
      if (!etag) throw new Error("upload_failed");
      return etag;
    }
    if (res && (res.status < 500 || attempt >= 3)) throw new Error(`put_${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}
