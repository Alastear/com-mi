/**
 * ที่อยู่อีเมลที่ "ส่งไปก็ไม่มีวันถึง" — ตัดทิ้งก่อนเรียก Resend
 *
 * ⚠️ dev กับ production ใช้ฐานข้อมูลตัวเดียวกัน ผู้ใช้ทดสอบ (`e2e-*@commi.local`) และออเดอร์ของเขา
 * จึงอยู่ในระบบจริง cron รายวันและทุก action ที่แจ้งเตือนเขาจะส่งอีเมลจริงไปหาที่อยู่พวกนี้
 * `.local` ไม่มี MX — Resend ไม่ปฏิเสธก็บันทึกเป็น hard bounce ผูกกับโดเมนผู้ส่งที่ยืนยันไว้
 * bounce สะสมมาก ๆ ทำให้ Resend/ผู้ให้บริการอีเมลลดความน่าเชื่อถือของโดเมน อีเมลถึงลูกค้าจริงจะตกไปถังขยะ
 *
 * ตัดเฉพาะ TLD ที่มาตรฐานสงวนไว้ว่าใช้ในอินเทอร์เน็ตจริงไม่ได้ (RFC 2606, RFC 6761, RFC 6762)
 * ไม่ใช่รายชื่อโดเมนที่ "ดูเหมือนปลอม" — เดาผิดเมื่อไรลูกค้าจริงไม่ได้อีเมล
 */
const RESERVED_TLDS = ["local", "test", "invalid", "example", "localhost"] as const;

export function isUndeliverableAddress(to: string): boolean {
  const at = to.lastIndexOf("@");
  if (at < 0) return false;
  // โดเมนเขียนตัวใหญ่ได้ และบางคนพิมพ์จุดท้ายแบบ FQDN มา (`a@b.local.`)
  const domain = to.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  return (RESERVED_TLDS as readonly string[]).includes(tld);
}
