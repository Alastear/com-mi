import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/lib/auth";

/**
 * ชั้นตรวจสิทธิ์จริง — ต้องเรียกใน Server Component / Server Action / Route Handler ทุกจุด
 *
 * `proxy.ts` เป็นแค่ UX gate เท่านั้น ห้ามพึ่งเป็นชั้นป้องกันหลัก
 * (Server Function ไม่ใช่ route แยก + เคยมี CVE เรื่อง middleware auth bypass มาแล้ว)
 *
 * ห่อด้วย React `cache()` เพื่อ dedupe ภายใน request เดียว — layout กับ page
 * เรียกได้ทั้งคู่โดยไม่โดน DB สองรอบ (และส่วนใหญ่ไม่โดนเลยเพราะมี cookieCache 5 นาที)
 */
export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/**
 * ด่านของ "ฝั่งครีเอเตอร์" — ต้องเปิดร้านแล้วเท่านั้น
 *
 * ทุกคนที่ล็อกอินเป็น **คนซื้อ** โดยปริยาย ไม่ต้องจอง handle ไม่มีร้านถูกสร้างให้
 * การเป็นครีเอเตอร์คือสิ่งที่กดเลือกเอง — คนที่มาจ้างวาดไม่ควรถูกบังคับให้ตั้งชื่อร้าน
 * ก่อนจะได้ใช้อะไรสักอย่าง
 *
 * `handle` จึงเป็นตัวชี้ขาดว่า "เปิดร้านแล้วหรือยัง" และการเด้งไป /onboarding
 * ไม่ใช่การบังคับอีกต่อไป — มาถึงตรงนี้ได้แปลว่ากดปุ่มเปิดร้านมาเอง
 * (หน้าของคนซื้ออยู่ที่ /my/requests ซึ่งใช้ requireSession เฉย ๆ)
 */
export async function requireCreator() {
  const session = await requireSession();
  if (!session.user.handle) redirect("/onboarding");
  return session;
}
