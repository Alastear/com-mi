"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireCreator } from "@/lib/auth-guard";

const SHOP_STATUSES = ["open", "closed", "waitlist", "vacation"] as const;

const ShopSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160),
  about: z.string().trim().max(2000),
  statusNote: z.string().trim().max(120),
  status: z.enum(SHOP_STATUSES),
  slotsTotal: z.coerce.number().int().min(0).max(99),
  /** กรอกบรรทัดละข้อ */
  tos: z.string().max(4000),
});

export type SaveShopResult = { ok: true } | { ok: false; error: string } | undefined;

export async function saveShop(
  _prev: SaveShopResult,
  formData: FormData,
): Promise<SaveShopResult> {
  // ชั้นป้องกันจริง — proxy.ts ไม่ครอบ Server Action
  const { user } = await requireCreator();

  const parsed = ShopSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;

  await getDb()
    .update(schema.creatorPage)
    .set({
      displayName: v.displayName,
      tagline: v.tagline,
      about: v.about,
      status: v.status,
      statusNote: v.statusNote,
      slotsTotal: v.slotsTotal,
      tos: v.tos
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
      updatedAt: new Date(),
    })
    .where(eq(schema.creatorPage.userId, user.id));

  revalidatePath("/shop");
  if (user.handle) revalidatePath(`/${user.handle}`);
  return { ok: true };
}

export async function setPublished(isPublished: boolean) {
  const { user } = await requireCreator();

  await getDb()
    .update(schema.creatorPage)
    .set({ isPublished, updatedAt: new Date() })
    .where(eq(schema.creatorPage.userId, user.id));

  revalidatePath("/shop");
  if (user.handle) revalidatePath(`/${user.handle}`);
}
