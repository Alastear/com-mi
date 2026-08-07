import { Resend } from "resend";
import { SITE_NAME, siteUrl } from "@/lib/site";

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
 * ผู้ส่ง
 *
 * ยังไม่ได้ยืนยันโดเมนของตัวเอง จึงต้องใช้ `onboarding@resend.dev` ของ Resend
 *
 * ⚠️ **ข้อจำกัดที่ต้องรู้ก่อนทดสอบ:** ตราบใดที่ยังไม่ยืนยันโดเมน
 * Resend ส่งได้เฉพาะไปยัง **อีเมลเจ้าของบัญชี Resend** เท่านั้น
 * ที่อยู่อื่นจะถูกปฏิเสธด้วย `validation_error` พร้อมบอกว่าที่อยู่ที่ยอมรับคืออะไร
 * แปลว่าอีเมลถึงลูกค้าจริง **ยังใช้ไม่ได้จนกว่าจะยืนยันโดเมน** ซึ่งต้องมีโดเมนก่อน
 * (โดเมนยังไม่ตัดสิน — docs/00 §2) พอยืนยันแล้วตั้ง `EMAIL_FROM` เป็นที่อยู่บนโดเมนนั้น
 */
function from(): string {
  return process.env.EMAIL_FROM ?? `${SITE_NAME} <onboarding@resend.dev>`;
}

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

  try {
    const { error } = await resend.emails.send({
      from: from(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) {
      console.error("[email] Resend ปฏิเสธ", error.name, error.message);
      return { sent: false, reason: error.name };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] ส่งไม่สำเร็จ", err);
    return { sent: false, reason: "threw" };
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
