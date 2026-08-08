import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { SITE_NAME } from "@/lib/site";
import { emailLayout, sendEmail } from "./send";

/**
 * อีเมลของระบบล็อกอิน — รหัสยืนยันและการเตือนความปลอดภัย
 *
 * ⚠️ **ไม่ผ่าน `after()`** ต่างจากอีเมลแจ้งเตือนออเดอร์ คนกรอกฟอร์มกำลังรอรหัสอยู่
 * ถ้าปล่อยให้ทำงานหลังส่ง response แล้วมันล้ม ผู้ใช้จะรออยู่อย่างนั้นโดยไม่มีอะไรบอก
 *
 * ⚠️ ภาษายังยึด default — Better Auth เรียกฟังก์ชันพวกนี้จาก endpoint ของตัวเอง
 * ซึ่งไม่ได้ผ่าน layout ที่อ่าน cookie ภาษา (TODO Phase 2: เก็บ `user.locale`)
 */
const t = () => getDictionary(DEFAULT_LOCALE).authMail;

/** ส่งไม่สำเร็จต้องรู้ตรงนี้ — `sendEmail` กลืน error แล้วคืน `{sent:false}` โดยตั้งใจ */
async function send(to: string, subject: string, body: string): Promise<boolean> {
  const { html, text } = emailLayout({
    heading: subject,
    body,
    footer: fill(getDictionary(DEFAULT_LOCALE).email.footer, { site: SITE_NAME }),
  });
  const res = await sendEmail({ to, subject, html, text });
  if (!res.sent) console.error("[auth-mail] ส่งไม่สำเร็จ:", res.reason);
  return res.sent;
}

/**
 * รหัสใช้ครั้งเดียวสำหรับเข้าสู่ระบบหรือตั้งรหัสผ่านใหม่
 *
 * บอกอายุรหัสในเนื้อความเสมอ — คนที่เปิดอีเมลช้าจะได้รู้ว่าต้องขอใหม่
 * ไม่ใช่กรอกรหัสหมดอายุซ้ำ ๆ แล้วโดนล็อกเพราะกรอกผิดครบสามครั้ง
 */
export function sendOtpEmail(to: string, otp: string, minutes: number): Promise<boolean> {
  const d = t();
  return send(to, d.otpSubject, fill(d.otpBody, { otp, minutes }));
}

/**
 * เตือนว่ารหัสผ่านถูกเปลี่ยน
 *
 * ส่งเสมอถึงแม้จะเป็นเจ้าตัวเปลี่ยนเอง — อีเมลฉบับนี้มีค่าเฉพาะตอนที่ **ไม่ใช่**
 * เจ้าตัวเป็นคนทำ และเราแยกสองกรณีนั้นไม่ออก
 */
export function sendPasswordChangedEmail(to: string): Promise<boolean> {
  const d = t();
  return send(to, d.passwordChangedSubject, d.passwordChangedBody);
}

/**
 * มีคนพยายามสมัครด้วยอีเมลที่มีบัญชีอยู่แล้ว
 *
 * ตอบฝั่งหน้าเว็บเหมือนสมัครสำเร็จเสมอ ไม่งั้นหน้าเว็บกลายเป็นเครื่องมือ
 * ตรวจว่าอีเมลไหนสมัครไว้แล้ว — ความจริงส่งไปทางอีเมลถึงเจ้าของตัวจริงแทน
 */
export function sendExistingAccountEmail(to: string, viaGoogle: boolean): Promise<boolean> {
  const d = t();
  return send(to, d.existingSubject, viaGoogle ? d.existingBodyGoogle : d.existingBodyPassword);
}
