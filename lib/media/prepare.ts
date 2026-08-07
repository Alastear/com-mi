import { rgbaToThumbHash } from "thumbhash";

/**
 * เตรียมรูปฝั่งเบราว์เซอร์ก่อนอัปโหลด
 *
 * ทำไมต้องย่อก่อนส่ง (docs/01-architecture.md §5):
 *   PNG 8 MB จากโปรแกรมวาด → WebP ~250 KB = ประหยัดพื้นที่ ~25 เท่า
 *   แปลว่าโควตาของแพ็กเกจฟรีรองรับรูปได้หลักพันชิ้น — พื้นที่ที่ใช้จริงหมดไปกับวิดีโอ
 *   และเพราะอัปโหลดตรงจากเบราว์เซอร์ไป Blob ไฟล์จึงไม่วิ่งผ่าน serverless function
 *   → ไม่เสียค่า data transfer และไม่ชนเพดาน request body 4.5 MB
 */

const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.82;

export type PreparedImage = {
  blob: Blob;
  width: number;
  height: number;
  /** base64 ของ thumbhash — เก็บลง DB ใช้เป็น placeholder ตอนโหลด */
  thumbhash: string;
  originalBytes: number;
};

/** ย่อให้ด้านยาวสุดไม่เกิน max โดยคงสัดส่วน (ไม่ขยายรูปที่เล็กกว่าอยู่แล้ว) */
function fit(w: number, h: number, max: number) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function draw(bitmap: ImageBitmap, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);

  try {
    const { width, height } = fit(bitmap.width, bitmap.height, MAX_EDGE);
    const blob = await draw(bitmap, width, height).convertToBlob({
      type: "image/webp",
      quality: WEBP_QUALITY,
    });

    // thumbhash รับได้สูงสุด 100×100 — ย่อลงมาอีกทีเฉพาะเพื่อคำนวณ
    const t = fit(bitmap.width, bitmap.height, 100);
    const small = draw(bitmap, t.width, t.height);
    const { data } = small.getContext("2d")!.getImageData(0, 0, t.width, t.height);
    const hash = rgbaToThumbHash(t.width, t.height, data);

    return {
      blob,
      width,
      height,
      thumbhash: btoa(String.fromCharCode(...hash)),
      originalBytes: file.size,
    };
  } finally {
    // ไม่ปล่อยจะค้างหน่วยความจำไว้จนกว่า GC จะมาเก็บ — สำคัญเมื่ออัปโหลดหลายไฟล์ติดกัน
    bitmap.close();
  }
}

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** ขนาดไฟล์ต้นทางที่ยอมรับก่อนย่อ — กันคนลากไฟล์ PSD 500 MB เข้ามา */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
