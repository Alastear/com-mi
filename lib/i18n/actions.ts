"use server";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth-guard";
import { isLocale } from "./config";

/**
 * จำภาษาที่เลือกไว้ที่บัญชี — เรียกจากปุ่มเปลี่ยนภาษา (lib/i18n/client.tsx)
 *
 * cookie ภาษาพอสำหรับหน้าเว็บ แต่อีเมลแจ้งเตือนส่งตอนที่ **อีกฝ่าย** กดอะไรสักอย่าง
 * ผู้รับไม่ได้อยู่ใน request นั้น จึงอ่าน cookie ของเขาไม่ได้ ต้องอ่านจาก `user.locale`
 *
 * ยังไม่ล็อกอิน = ไม่ทำอะไร (hook ตอนล็อกอินใน lib/auth.ts จะหยิบ cookie ไปเก็บให้เอง)
 * ⚠️ ล้มเงียบ — การเปลี่ยนภาษาของหน้าเว็บต้องไม่พังเพราะเขียนบัญชีไม่ผ่าน
 */
export async function saveLocale(next: string): Promise<void> {
  if (!isLocale(next)) return;
  try {
    const session = await getSession();
    if (!session) return;
    await getDb()
      .update(schema.user)
      .set({ locale: next })
      .where(
        and(
          eq(schema.user.id, session.user.id),
          // กดภาษาเดิมซ้ำไม่ต้องเขียน
          or(isNull(schema.user.locale), ne(schema.user.locale, next)),
        ),
      );
  } catch (err) {
    console.error("[locale] บันทึกภาษาไม่สำเร็จ", err);
  }
}
