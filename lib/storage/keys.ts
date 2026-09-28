/**
 * กฎของที่อยู่ไฟล์ใน R2 และค่าที่ต้องตรงกันทุกฝั่ง
 *
 * ⚠️ เป็นไฟล์บริสุทธิ์ ห้าม import "server-only" หรือ DB — มีเทสต์ด้วย node:test
 * และฝั่ง client ใช้ `partPlan` ตัวเดียวกันตัดไฟล์เป็นชิ้น
 */

const MiB = 1024 * 1024;

/**
 * ชิ้นละ 8 MiB — R2 บังคับขั้นต่ำ 5 MiB ต่อชิ้น (ยกเว้นชิ้นสุดท้าย)
 * ชิ้นเล็กแปลว่าเน็ตหลุดกลางทางแล้วเสียงานน้อย: ชิ้นที่ล้มถูกส่งใหม่แค่ชิ้นนั้น
 * (lib/uploads/client.ts รอเน็ตกลับมาและลองซ้ำได้ราวสองสามนาที)
 * ⚠️ แต่ถ้าชิ้นเดียวล้มจนหมดโควตาการลองซ้ำ ทั้งไฟล์ต้องเริ่มใหม่ตั้งแต่ชิ้นแรก — ยังไม่มีการอัปต่อจากที่ค้าง
 */
export const PART_SIZE = 8 * MiB;

/**
 * อายุ URL ของแต่ละชิ้น (วินาที) — ไฟล์ 2 GB บนเน็ตมือถือใช้เวลาหลายชั่วโมงได้
 * อายุของคำขออัปโหลดต้องยาวกว่านี้ (lib/uploads/intent.ts) ดูเหตุผลที่นั่น
 */
export const PART_URL_TTL_SECONDS = 6 * 60 * 60;

/**
 * เพดานต่อไฟล์ส่งมอบ — มาจาก `media.bytes` ซึ่งเป็น integer 32 บิต (สูงสุด ~2 GiB)
 * ไฟล์ที่ใหญ่กว่านี้บันทึกขนาดลง DB ไม่ได้ จึงต้องปฏิเสธตั้งแต่ก่อนอัป
 * 2000 MiB = 250 ชิ้น — URL ที่เซ็นไว้ทั้งหมดยังเล็กพอส่งกลับในคำตอบเดียว
 */
export const MAX_DELIVERY_BYTES = 2000 * MiB;

/**
 * ขนาดของแต่ละชิ้น เรียงตามลำดับ — ผลรวมเท่ากับ `bytes` พอดี
 *
 * ขนาดของทุกชิ้นถูกเซ็นลงใน URL ของชิ้นนั้น (R2 ตอบ 403 ถ้าไม่ตรง)
 * ฝั่ง client จึงต้องตัดไฟล์ด้วยฟังก์ชันนี้ตัวเดียวกันเป๊ะ
 */
export function partPlan(bytes: number, partSize: number = PART_SIZE): number[] {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return [];
  const sizes: number[] = [];
  for (let left = bytes; left > 0; left -= partSize) sizes.push(Math.min(partSize, left));
  return sizes;
}

/** ความยาวชื่อไฟล์สูงสุดที่เก็บ (นับแบบ `string.length` เหมือน zod ฝั่งเซิร์ฟเวอร์) */
export const MAX_FILENAME_LENGTH = 200;

/**
 * ตัดชื่อไฟล์ให้ไม่เกิน `max` โดย **เก็บนามสกุลไว้**
 *
 * ชื่อนี้กลายเป็นชื่อไฟล์ตอนลูกค้าดาวน์โหลด (Content-Disposition)
 * เดิมตัดจากท้ายตรง ๆ ชื่อไทยยาว ๆ ของไฟล์ `.clip` จึงเหลือแค่ชื่อไม่มีนามสกุล
 * ลูกค้าดับเบิลคลิกแล้วเครื่องไม่รู้ว่าจะเปิดด้วยอะไร
 *
 * ⚠️ ไม่ตัดกลางคู่ surrogate (อีโมจิ) — ครึ่งตัวกลายเป็นอักขระเสียใน header
 */
export function clampFilename(name: string, max: number = MAX_FILENAME_LENGTH): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  const dot = trimmed.lastIndexOf(".");
  // นามสกุลจริงสั้นเสมอ — จุดที่อยู่ลึกเข้าไปในชื่อยาว ๆ ไม่ใช่นามสกุล
  const ext = dot > 0 && trimmed.length - dot <= 16 ? trimmed.slice(dot) : "";
  return cutUtf16(trimmed.slice(0, trimmed.length - ext.length), max - ext.length).trimEnd() + ext;
}

function cutUtf16(s: string, n: number): string {
  if (s.length <= n) return s;
  const code = s.charCodeAt(n - 1);
  // ตัวสุดท้ายที่เหลือเป็นครึ่งหน้าของคู่ surrogate — ถอยไปอีกหนึ่ง
  return s.slice(0, code >= 0xd800 && code <= 0xdbff ? n - 1 : n);
}

/**
 * นามสกุลไฟล์ใน key ของไฟล์สาธารณะ — ช่วยให้คนเปิด URL ตรง ๆ แล้วเบราว์เซอร์เดาชนิดถูก
 * ชนิดที่ไม่รู้จักไม่มีนามสกุล ไม่ใช่เดาเอาเอง
 */
const EXT: Record<string, string> = {
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function publicKey(kind: string, token: string, contentType: string): string {
  const ext = EXT[contentType];
  return ext ? `${kind}/${token}.${ext}` : `${kind}/${token}`;
}

/** URL สาธารณะของไฟล์ — ทนทั้ง base ที่มีและไม่มี `/` ต่อท้าย */
export function publicUrlFor(base: string, key: string): string {
  return `${base.replace(/\/+$/, "")}/${key}`;
}

/**
 * ชนิดไฟล์ที่ยอมเก็บเป็น metadata ของไฟล์ส่งมอบ
 *
 * ไฟล์ส่งมอบรับได้ทุกชนิด แต่ค่านี้มาจาก `file.type` ของเบราว์เซอร์และถูกเซ็นลง URL
 * สตริงแปลก ๆ (มีขึ้นบรรทัด ยาวผิดปกติ) จะกลายเป็น header ตอนดาวน์โหลด
 * — ไม่ใช่รูปแบบ `type/subtype` ก็ใช้ค่ากลางไป
 */
export function safeContentType(raw: string): string {
  const t = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,127}$/.test(t)
    ? t
    : "application/octet-stream";
}

/**
 * header `Content-Disposition` ตอนดาวน์โหลด — บังคับให้เป็นการโหลดไฟล์ ไม่ใช่เปิดในแท็บ
 * และตั้งชื่อไฟล์เป็นชื่อเดิมที่ครีเอเตอร์อัปมา (key ใน R2 เป็นแค่ id)
 *
 * ชื่อไทยต้องไปทาง `filename*` (RFC 5987) ส่วน `filename` ธรรมดาเป็นทางสำรอง
 * สำหรับโปรแกรมเก่าที่อ่านได้แค่ ASCII — ตัวที่ไม่ใช่ ASCII กลายเป็น `_`
 * `"` กับ `\` ถูกตัดทิ้ง ไม่งั้นปิดเครื่องหมายคำพูดก่อนเวลาแล้วแทรก parameter ได้
 */
export function attachmentDisposition(filename: string): string {
  const name = filename.replace(/[\r\n"\\/]/g, "").trim() || "download";
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
