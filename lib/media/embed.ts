/**
 * ลิงก์วิดีโอจากภายนอก (YouTube / Vimeo)
 *
 * ทำไมต้องมี ทั้งที่อัปตรงได้แล้ว: รีลยาว 6 นาทีไม่ควรกินโควตาฟรี 300 MB
 * และครีเอเตอร์วิดีโอส่วนใหญ่มีช่องอยู่แล้ว การบังคับให้อัปซ้ำคือการขอให้ทำงานเพิ่ม
 *
 * ⚠️ **whitelist โดเมนเท่านั้น ห้ามรับ URL อะไรก็ได้**
 * ถ้าปล่อยผ่าน ค่านี้จะไปอยู่ใน `src` ของ iframe บนหน้าร้านสาธารณะ
 * ซึ่งเท่ากับให้ครีเอเตอร์ฝังหน้าเว็บอะไรก็ได้ในโดเมนเรา
 */

export type EmbedProvider = "youtube" | "vimeo";

export type ParsedEmbed = {
  provider: EmbedProvider;
  /** id ของวิดีโอ ไม่ใช่ URL — ประกอบ URL เองตอนแสดงผลเสมอ */
  videoId: string;
};

/**
 * เก็บเป็น id ไม่ใช่ URL ทั้งก้อน
 * เพราะ URL ที่ผู้ใช้วางมามี query string ติดมาได้ทุกอย่าง (เวลาเริ่ม, playlist,
 * พารามิเตอร์ติดตาม) การประกอบใหม่จาก id ทำให้รู้แน่ว่าจะได้อะไรออกไป
 */
export function parseEmbed(input: string): ParsedEmbed | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = url.pathname === "/watch" ? url.searchParams.get("v") : null;
    // /shorts/<id> และ /embed/<id> ก็รับ — เป็นรูปแบบที่คนก็อปมาบ่อย
    const path = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,20})$/)?.[1];
    const videoId = id ?? path;
    return videoId && /^[\w-]{6,20}$/.test(videoId) ? { provider: "youtube", videoId } : null;
  }

  if (host === "youtu.be") {
    const videoId = url.pathname.slice(1);
    return /^[\w-]{6,20}$/.test(videoId) ? { provider: "youtube", videoId } : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const videoId = url.pathname.match(/(\d{6,12})/)?.[1];
    return videoId ? { provider: "vimeo", videoId } : null;
  }

  return null;
}

/** URL สำหรับ iframe — ประกอบเองจาก id เสมอ ไม่เอาของที่ผู้ใช้วางมา */
export function embedIframeUrl(e: ParsedEmbed): string {
  return e.provider === "youtube"
    ? // nocookie: ไม่ตั้งคุกกี้ติดตามจนกว่าผู้ใช้จะกดเล่นจริง
      `https://www.youtube-nocookie.com/embed/${e.videoId}?rel=0`
    : `https://player.vimeo.com/video/${e.videoId}`;
}

/** ลิงก์ไปหน้าต้นทาง — ใช้เป็นทางถอยเมื่อ iframe โหลดไม่ได้ */
export function embedWatchUrl(e: ParsedEmbed): string {
  return e.provider === "youtube"
    ? `https://www.youtube.com/watch?v=${e.videoId}`
    : `https://vimeo.com/${e.videoId}`;
}

/** เก็บลง DB เป็นสตริงเดียว — `youtube:dQw4w9WgXcQ` */
export function serializeEmbed(e: ParsedEmbed): string {
  return `${e.provider}:${e.videoId}`;
}

export function deserializeEmbed(value: string): ParsedEmbed | null {
  const [provider, videoId] = value.split(":");
  if ((provider !== "youtube" && provider !== "vimeo") || !videoId) return null;
  return /^[\w-]{6,20}$/.test(videoId) ? { provider, videoId } : null;
}
