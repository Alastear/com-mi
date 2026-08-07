"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireCreator } from "@/lib/auth-guard";
import {
  isValidPromptPayId,
  normalizePromptPayId,
  PROMPTPAY_TYPES,
} from "@/lib/payments/promptpay-id";

const ContactSchema = z.object({
  // เก็บตัวเลขล้วน แต่รับรูปแบบที่คนพิมพ์จริง (มีขีด เว้นวรรค +66) — ตัดที่นี่ทีเดียว
  contactPhone: z.string().trim().max(30),
});

export type SaveContactResult = { ok: true } | { ok: false; error: "invalid" } | undefined;

/**
 * เบอร์ติดต่อของครีเอเตอร์ — ผู้ดูแลใช้ติดต่อกลับเวลามีเรื่อง
 *
 * ไม่ใช่ปัจจัยล็อกอินและไม่ใช่ช่องทาง OTP จึงไม่ต้องยืนยันเบอร์
 * ตรวจแค่รูปแบบเบอร์ไทย 10 หลักขึ้นต้น 0 · ปล่อยว่าง = ไม่ให้เบอร์ ซึ่งไม่ใช่ error
 */
export async function saveContact(
  _prev: SaveContactResult,
  formData: FormData,
): Promise<SaveContactResult> {
  const { user } = await requireCreator();

  const parsed = ContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid" };

  const digits = parsed.data.contactPhone.replace(/\D/g, "");
  if (digits && !/^0\d{9}$/.test(digits)) return { ok: false, error: "invalid" };

  await getDb()
    .update(schema.creatorPage)
    .set({ contactPhone: digits || null, updatedAt: new Date() })
    .where(eq(schema.creatorPage.userId, user.id));

  revalidatePath("/settings");
  return { ok: true };
}

const Schema = z.object({
  promptpayType: z.enum(PROMPTPAY_TYPES),
  promptpayId: z.string().trim().max(40),
  promptpayName: z.string().trim().max(80),
});

export type SavePayoutResult = { ok: true } | { ok: false; error: "invalid" } | undefined;

/**
 * บันทึกหมายเลขรับเงินของครีเอเตอร์
 *
 * เก็บเฉพาะตัวเลขล้วน — ผู้ใช้พิมพ์ 081-234-5678 หรือเว้นวรรคมาได้
 * แล้วตอนสร้าง payload QR ต้องได้ตัวเลขติดกันเท่านั้น ถ้าเก็บขีดไว้ QR จะผิด
 *
 * ปล่อยว่างได้ = ยังไม่ตั้งค่า (ล้างทั้งสามช่อง) ไม่ใช่ error
 */
export async function savePayout(
  _prev: SavePayoutResult,
  formData: FormData,
): Promise<SavePayoutResult> {
  const { user } = await requireCreator();

  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  const digits = normalizePromptPayId(v.promptpayId);
  if (digits && !isValidPromptPayId(v.promptpayType, digits)) {
    return { ok: false, error: "invalid" };
  }

  await getDb()
    .update(schema.creatorPage)
    .set({
      promptpayType: digits ? v.promptpayType : null,
      promptpayId: digits || null,
      promptpayName: digits ? v.promptpayName : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.creatorPage.userId, user.id));

  revalidatePath("/settings");
  return { ok: true };
}
