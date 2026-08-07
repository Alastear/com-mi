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
