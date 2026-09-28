import { Resend } from "resend";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { isUndeliverableAddress } from "./address";
import { EMAIL_GAP_MS, createPacer, rateLimitDelayMs } from "./pace";

/**
 * ส่งอีเมลผ่าน Resend
 *
 * ⚠️ **ห้ามให้การส่งอีเมลบล็อกคำขอของผู้ใช้** — เรียกผ่าน `after()` เสมอ
 * ถ้าเรียกตรง ๆ ปุ่ม "ยืนยันเงินเข้า" จะค้างรอ API ของ Resend ตอบก่อน
 * ทั้งที่งานจริงบันทึกลง DB เสร็จไปแล้ว
 *
 * ⚠️ **ล้มเหลวเงียบ ๆ โดยตั้งใจ** เหตุผลเดียวกับ `notify()` —
 * อีเมลไม่ออกหนึ่งฉบับ ยอมรับได้ แต่การกระทำหลักที่สำเร็จแล้วดูเหมือนพัง ยอมไม่ได้
 *
 * ตัว client สร้างแบบ lazy — `new Resend()` ตอน import จะโยนตอน `next build`
 * ถ้ายังไม่มี env (กับดักเดียวกับ getDb / getAuth ใน docs/01 §3)
 */

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client ??= new Resend(key);
  return client;
}

/**
 * ผู้ส่ง — `EMAIL_FROM` เช่น `com-mi <noreply@com-mi.poruyrai.xyz>`
 *
 * โดเมน `com-mi.poruyrai.xyz` ยืนยันกับ Resend แล้ว (สถานะ verified) อีเมลจึงส่งถึง
 * ที่อยู่ไหนก็ได้ ไม่ใช่เฉพาะเจ้าของบัญชี Resend เหมือนตอนยังใช้ `onboarding@resend.dev`
 *
 * ⚠️ `EMAIL_FROM` เป็นสวิตช์ของระบบล็อกอินด้วย (lib/auth.ts `emailReady`) — ไม่ตั้ง =
 * ปิดล็อกอินด้วยรหัสผ่านและ OTP ทั้งชุด ค่าสำรองข้างล่างมีไว้ให้ dev ที่ไม่มี env เท่านั้น
 * และส่งได้แค่ถึงเจ้าของบัญชี Resend
 *
 * ⚠️ ย้ายโดเมนเมื่อไร ต้องยืนยันโดเมนใหม่กับ Resend **ก่อน** เปลี่ยน `EMAIL_FROM`
 * ไม่งั้น Resend ปฏิเสธทุกฉบับด้วย `validation_error` และ `sendEmail()` กลืน error ไว้เงียบ ๆ
 */
function from(): string {
  return process.env.EMAIL_FROM ?? `${SITE_NAME} <onboarding@resend.dev>`;
}

/**
 * ตัวเดียวทั้ง process — callback ของ `after()` ทุกตัวในคำขอเดียวกัน (และคำขออื่นที่มาลงเครื่องเดียวกัน)
 * ต่อคิวผ่านตัวนี้ ไม่ใช่ยิง Resend พร้อมกันจนโดน 429
 */
const pacer = createPacer({ gapMs: EMAIL_GAP_MS });

export type SendResult = { sent: boolean; reason?: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  /** เนื้อหาแบบ HTML — ต้องมีฉบับข้อความล้วนคู่กันเสมอ ดู `text` */
  html: string;
  /** บางคนอ่านอีเมลแบบข้อความล้วน และ spam filter ให้คะแนนดีกว่าเมื่อมีทั้งคู่ */
  text: string;
}): Promise<SendResult> {
  const resend = getClient();
  if (!resend) return { sent: false, reason: "no_api_key" };
  // ผู้ใช้ทดสอบในฐานข้อมูลจริง (`@commi.local`) — ส่งไปก็ bounce และทำให้โดเมนผู้ส่งเสียชื่อ ดู address.ts
  if (isUndeliverableAddress(input.to)) return { sent: false, reason: "undeliverable_address" };

  for (let attempt = 0; ; attempt++) {
    // ต่อคิวทุกการยิงในเครื่องนี้ รวมถึงการลองซ้ำ — ดู pace.ts
    await pacer.wait();
    try {
      const { error, headers } = await resend.emails.send({
        from: from(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      if (!error) return { sent: true };
      /**
       * 429 = Resend ยังไม่ได้รับฉบับนี้ ลองใหม่ได้โดยไม่เสี่ยงส่งซ้ำ
       * ⚠️ error อื่น (และ throw ข้างล่าง) ห้ามลองซ้ำ — บางแบบ Resend อาจรับไปแล้ว ลูกค้าจะได้สองฉบับ
       */
      if (error.name === "rate_limit_exceeded") {
        const wait = rateLimitDelayMs(attempt + 1, headers?.["retry-after"]);
        if (wait !== null) {
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
      }
      console.error("[email] Resend ปฏิเสธ", error.name, error.message);
      return { sent: false, reason: error.name };
    } catch (err) {
      console.error("[email] ส่งไม่สำเร็จ", err);
      return { sent: false, reason: "threw" };
    }
  }
}

/**
 * โครงอีเมลกลาง — ทุกฉบับหน้าตาเดียวกัน
 *
 * เขียนเป็น HTML ตรง ๆ ไม่ใช้ React Email เพราะอีเมลของเรามีไม่กี่แบบ
 * และ inline CSS ที่ client อีเมลรองรับจริงมีน้อยมากอยู่แล้ว
 * ตารางกับ inline style คือสิ่งที่ Gmail/Outlook อ่านได้แน่นอน
 */
export function emailLayout(input: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaPath?: string;
  footer: string;
}): { html: string; text: string } {
  const url = input.ctaPath ? `${siteUrl()}${input.ctaPath}` : null;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Thai',sans-serif;color:#18181b;line-height:1.6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">
<tr><td>
<p style="margin:0 0 6px;font-size:13px;color:#71717a">${escapeHtml(SITE_NAME)}</p>
<h1 style="margin:0 0 12px;font-size:19px;font-weight:600">${escapeHtml(input.heading)}</h1>
<p style="margin:0 0 20px;font-size:15px;white-space:pre-line">${escapeHtml(input.body)}</p>
${
  url && input.ctaLabel
    ? `<p style="margin:0 0 20px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:15px;font-weight:500">${escapeHtml(input.ctaLabel)}</a></p>`
    : ""
}
<p style="margin:0;font-size:12px;color:#a1a1aa">${escapeHtml(input.footer)}</p>
</td></tr></table></body></html>`;

  const text = [
    input.heading,
    "",
    input.body,
    url ? `\n${input.ctaLabel ?? ""}: ${url}` : "",
    "",
    input.footer,
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}

/** เนื้อหามาจากข้อมูลผู้ใช้ (ชื่อร้าน ข้อความ) จึง escape ทุกจุดที่แทรกเข้า HTML */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
