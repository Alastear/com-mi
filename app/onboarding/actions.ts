"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { requireSession } from "@/lib/auth-guard";
import { checkHandle } from "@/lib/handles";

export type ClaimResult = { error: "format" | "reserved" | "taken" } | undefined;

/**
 * จอง handle ให้ผู้ใช้ที่ล็อกอินอยู่
 *
 * ทุก Server Action ต้องเริ่มด้วย requireSession() เสมอ —
 * proxy.ts ไม่ครอบ Server Action และไม่ใช่ชั้นป้องกันจริง
 */
export async function claimHandle(
  _prev: ClaimResult,
  formData: FormData,
): Promise<ClaimResult> {
  const { user } = await requireSession();

  const checked = checkHandle(String(formData.get("handle") ?? ""));
  if (!checked.ok) return { error: checked.reason };

  const db = getDb();

  // เช็คก่อนเพื่อให้ข้อความ error ดูดี แต่ unique constraint ใน DB คือตัวตัดสินจริง
  const existing = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(schema.user.handle, checked.handle),
  });
  if (existing && existing.id !== user.id) return { error: "taken" };

  try {
    await db
      .update(schema.user)
      .set({ handle: checked.handle, updatedAt: new Date() })
      .where(eq(schema.user.id, user.id));
  } catch {
    // ชนกับ unique constraint = มีคนคว้าไปก่อนระหว่างที่กำลังกรอก
    return { error: "taken" };
  }

  /**
   * ⚠️ ต้อง refresh cookie cache ทุกครั้งที่แก้ฟิลด์ของ user ตรง ๆ ผ่าน Drizzle
   *
   * `session.cookieCache` เก็บ session ที่เซ็นแล้วไว้ในคุกกี้ 5 นาที และ **ไม่รู้เลย**
   * ว่าเราไปแก้แถวใน DB (ตัวเลือก `cookieCache.version` เทียบกับข้อมูลใน cache เอง
   * จึงใช้ตรวจการเปลี่ยนแปลงใน DB ไม่ได้)
   *
   * ถ้าไม่ refresh: คุกกี้ยังบอกว่า handle = null → requireCreator() ใน (app)/layout
   * เด้งกลับมา /onboarding อีกรอบ → ผู้ใช้ติดลูปจนกว่า cache จะหมดอายุใน 5 นาที
   *
   * `disableCookieCache` บังคับให้อ่านจาก DB แล้วเขียน cache ใหม่
   * (คุกกี้ถูก apply ผ่าน plugin `nextCookies()` และอยู่รอดข้าม redirect)
   */
  await getAuth().api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });

  redirect("/dashboard");
}
