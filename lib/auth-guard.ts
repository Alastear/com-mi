import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

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

/**
 * ด่านของผู้ดูแลแพลตฟอร์ม
 *
 * ⚠️ **อ่าน `role` จากฐานข้อมูลสด ไม่ใช่จาก session** — `cookieCache` เก็บ snapshot
 * ที่เซ็นไว้ 5 นาที และไม่รู้เลยว่าแถวใน DB เปลี่ยนไปแล้ว ถ้าเชื่อค่าในคุกกี้
 * คนที่เพิ่งถูกถอดสิทธิ์จะยังใช้สิทธิ์ผู้ดูแลได้อีกถึงห้านาที — นานพอจะทำเรื่องที่
 * เป็นเหตุให้ถูกถอดสิทธิ์ตั้งแต่แรก แลกด้วยหนึ่งคิวรีต่อการเปิดหน้าหลังบ้าน
 * ซึ่งเป็นหน้าที่มีคนเปิดวันละไม่กี่ครั้ง
 *
 * ไม่ redirect ไปหน้าอื่นแต่โยน 404 — หน้าที่ตอบ 403 คือการยืนยันให้คนนอกรู้ว่า
 * เส้นทางนี้มีอยู่จริง ส่วน 404 บอกแค่ว่าไม่มีอะไรตรงนี้ เหมือนกับ URL มั่ว ๆ ทั่วไป
 */
export async function requireAdmin() {
  const session = await requireSession();

  const row = await getDb().query.user.findFirst({
    columns: { role: true },
    where: eq(schema.user.id, session.user.id),
  });
  if (row?.role !== "admin") notFound();

  return session;
}
