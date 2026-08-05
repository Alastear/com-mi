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

/** ผู้ใช้ที่ยังไม่ได้ตั้ง handle = ยังทำ onboarding ไม่เสร็จ */
export async function requireCreator() {
  const session = await requireSession();
  if (!session.user.handle) redirect("/onboarding");
  return session;
}
