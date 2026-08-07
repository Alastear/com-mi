import { rgbaToThumbHash } from "thumbhash";

/**
 * เตรียมวิดีโอตัวอย่างสำหรับหน้าร้าน
 *
 * ⚠️ **ไม่แตะตัววิดีโอเลย** — อัปขึ้นไปตามไฟล์ต้นฉบับ
 * การ transcode ในเบราว์เซอร์ต้องใช้ WebCodecs หรือ ffmpeg.wasm ซึ่งกินเวลาหลายนาที
 * บนมือถือ กินแรม และให้ผลไม่แน่นอน — แลกกับการประหยัดพื้นที่ที่ไม่คุ้ม
 * แทนที่ด้วยการ **จำกัดขนาดและความยาวตั้งแต่ต้นทาง** ซึ่งผู้ใช้เข้าใจได้และตรวจได้ทันที
 *
 * สิ่งที่ทำคือดึงเฟรมมาทำ "ภาพปก" เพื่อให้กริดผลงานไม่ต้องโหลดวิดีโอทุกอัน
 * — หน้าร้านที่มีคลิปหกอันแล้วโหลดครบทุกอันคือ 100+ MB ต่อการเปิดหนึ่งครั้ง
 */

/** ชนิดวิดีโอที่เบราว์เซอร์ทั่วไปเล่นได้โดยไม่ต้องมี codec เสริม */
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** คลิปตัวอย่าง ไม่ใช่ไฟล์ส่งมอบ — ยาวเกินนี้ให้ไปฝังลิงก์แทน */
export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

export type PreparedVideo = {
  /** ไฟล์วิดีโอต้นฉบับ ไม่ถูกแปลง */
  file: File;
  durationSeconds: number;
  width: number;
  height: number;
  /** ภาพปกที่ดึงจากเฟรมแรก ๆ — WebP เล็ก ๆ อัปเป็นไฟล์แยก */
  poster: Blob;
  posterWidth: number;
  posterHeight: number;
  thumbhash: string;
};

export type VideoRejection =
  | { ok: false; reason: "too_long"; seconds: number }
  | { ok: false; reason: "too_big" }
  | { ok: false; reason: "unreadable" };

export type PrepareVideoResult = { ok: true; value: PreparedVideo } | VideoRejection;

export async function prepareVideo(file: File): Promise<PrepareVideoResult> {
  if (file.size > MAX_VIDEO_BYTES) return { ok: false, reason: "too_big" };

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  // บาง iOS จะไม่โหลดเฟรมถ้าไม่ได้ตั้ง playsInline
  video.playsInline = true;
  video.src = url;

  try {
    await once(video, "loadedmetadata");
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return { ok: false, reason: "unreadable" };
    if (duration > MAX_VIDEO_SECONDS + 0.5) {
      return { ok: false, reason: "too_long", seconds: Math.round(duration) };
    }

    /**
     * ข้ามไปสักหน่อยก่อนดึงเฟรม — คลิปจำนวนมากเริ่มด้วยเฟรมดำหรือ fade in
     * เฟรมที่ 0 จึงมักได้ภาพปกสีดำล้วนซึ่งไม่บอกอะไรเลย
     */
    video.currentTime = Math.min(duration * 0.1, 1);
    await once(video, "seeked");

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return { ok: false, reason: "unreadable" };

    const poster = await drawPoster(video, vw, vh, 1280);
    const small = await drawPoster(video, vw, vh, 100);
    const thumbhash = await hashFrom(small.blob, small.width, small.height);

    return {
      ok: true,
      value: {
        file,
        durationSeconds: Math.round(duration),
        width: vw,
        height: vh,
        poster: poster.blob,
        posterWidth: poster.width,
        posterHeight: poster.height,
        thumbhash,
      },
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    // ปล่อยทั้ง object URL และตัว element ไม่งั้นวิดีโอค้างในหน่วยความจำ
    video.src = "";
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function drawPoster(
  video: HTMLVideoElement,
  vw: number,
  vh: number,
  maxEdge: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxEdge / Math.max(vw, vh));
  const width = Math.max(1, Math.round(vw * scale));
  const height = Math.max(1, Math.round(vh * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(video, 0, 0, width, height);

  const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
  return { blob, width, height };
}

async function hashFrom(blob: Blob, width: number, height: number): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return btoa(String.fromCharCode(...rgbaToThumbHash(width, height, data)));
  } finally {
    bitmap.close();
  }
}

/** รอ event เดียวแบบมี timeout — วิดีโอเสียบางไฟล์ไม่ยิง event อะไรเลย */
function once(el: HTMLVideoElement, event: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("error"));
    };
    function cleanup() {
      clearTimeout(timer);
      el.removeEventListener(event, onOk);
      el.removeEventListener("error", onErr);
    }
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener("error", onErr, { once: true });
  });
}
