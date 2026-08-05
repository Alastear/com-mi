"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
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

  redirect("/dashboard");
}
