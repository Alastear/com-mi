"use server";

import { head } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { requireCreator } from "@/lib/auth-guard";
import { parseEmbed, serializeEmbed } from "@/lib/media/embed";
import { PUBLIC_MEDIA_KINDS } from "@/lib/media/kinds";

const RegisterSchema = z.object({
  url: z.url(),
  pathname: z.string().min(1),
  // เฉพาะชนิดที่อยู่ store สาธารณะ — ไฟล์ส่งมอบมี registerDeliveryFile ของตัวเอง
  kind: z.enum(PUBLIC_MEDIA_KINDS),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  thumbhash: z.string().max(200),
  /** วิดีโอ: ภาพปกกับความยาว — ไม่มีเมื่อเป็นรูป */
  posterUrl: z.url().nullish(),
  posterPathname: z.string().max(400).nullish(),
  durationSeconds: z.number().int().positive().max(3600).nullish(),
});

export type RegisterMediaInput = z.infer<typeof RegisterSchema>;

/**
 * บันทึกไฟล์ที่เพิ่งอัปโหลดลงตาราง media
 *
 * เรียกจาก client หลัง `upload()` สำเร็จ — ไม่ใช้ `onUploadCompleted`
 * เพราะ callback นั้นไม่ทำงานบน localhost (ดูคอมเมนต์ใน app/api/blob/upload/route.ts)
 *
 * ขนาดไฟล์อ่านจาก `head()` ไม่ใช่จากที่ client ส่งมา — client แก้ตัวเลขได้
 * ซึ่งจะทำให้โควตาพื้นที่ไร้ความหมาย
 */
export async function registerMedia(input: RegisterMediaInput): Promise<{ id: string }> {
  const { user } = await requireCreator();
  const v = RegisterSchema.parse(input);

  const meta = await head(v.url);

  const id = newId("med");
  await getDb().insert(schema.media).values({
    id,
    ownerUserId: user.id,
    pathname: v.pathname,
    url: v.url,
    access: "public",
    kind: v.kind,
    contentType: meta.contentType ?? "image/webp",
    bytes: meta.size,
    width: v.width,
    height: v.height,
    thumbhash: v.thumbhash,
    posterUrl: v.posterUrl ?? null,
    posterPathname: v.posterPathname ?? null,
    durationSeconds: v.durationSeconds ?? null,
    // ยัง orphan จนกว่าจะถูกผูกกับ record จริง — cron เก็บกวาดตัวที่ค้างเกิน 24 ชม.
    status: "orphan",
  });

  return { id };
}

/** ผูกรูปเป็นแบนเนอร์หรืออวาตาร์ของหน้าร้าน */
export async function setShopImage(mediaId: string, slot: "banner" | "avatar") {
  const { user } = await requireCreator();
  const db = getDb();

  // ต้องเป็นไฟล์ของตัวเองเท่านั้น — กันการยัด mediaId ของคนอื่น
  const owned = await db.query.media.findFirst({
    columns: { id: true },
    where: and(eq(schema.media.id, mediaId), eq(schema.media.ownerUserId, user.id)),
  });
  if (!owned) throw new Error("not_found");

  await db
    .update(schema.creatorPage)
    .set(
      slot === "banner"
        ? { bannerMediaId: mediaId, updatedAt: new Date() }
        : { avatarMediaId: mediaId, updatedAt: new Date() },
    )
    .where(eq(schema.creatorPage.userId, user.id));

  await db.update(schema.media).set({ status: "linked" }).where(eq(schema.media.id, mediaId));

  revalidatePath("/shop");
  if (user.handle) revalidatePath(`/${user.handle}`);
}

/**
 * เพิ่มลิงก์วิดีโอภายนอกเข้าพอร์ตโฟลิโอ
 *
 * เก็บเป็น `provider:id` ไม่ใช่ URL ทั้งก้อน และ parse ฝั่ง server อีกรอบ
 * ถึงแม้ฝั่ง client จะตรวจแล้ว — ค่านี้จบลงใน `src` ของ iframe บนหน้าสาธารณะ
 */
export async function addPortfolioEmbed(rawUrl: string, title = "") {
  const { user } = await requireCreator();
  const db = getDb();

  const parsed = parseEmbed(rawUrl);
  if (!parsed) throw new Error("invalid_embed");

  const page = await db.query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.userId, user.id),
  });
  if (!page) throw new Error("not_found");

  const existing = await db.query.portfolioItem.findMany({
    columns: { id: true },
    where: eq(schema.portfolioItem.creatorPageId, page.id),
  });

  await db.insert(schema.portfolioItem).values({
    id: newId("port"),
    creatorPageId: page.id,
    mediaId: null,
    embedRef: serializeEmbed(parsed),
    title: title.slice(0, 120),
    sortOrder: existing.length,
  });

  revalidatePath("/portfolio");
  if (user.handle) revalidatePath(`/${user.handle}`);
}

/** เพิ่มรูปหรือวิดีโอที่อัปเองเข้าพอร์ตโฟลิโอ */
export async function addPortfolioItem(mediaId: string, title = "") {
  const { user } = await requireCreator();
  const db = getDb();

  const [owned, page] = await Promise.all([
    db.query.media.findFirst({
      columns: { id: true },
      where: and(eq(schema.media.id, mediaId), eq(schema.media.ownerUserId, user.id)),
    }),
    db.query.creatorPage.findFirst({
      columns: { id: true },
      where: eq(schema.creatorPage.userId, user.id),
    }),
  ]);
  if (!owned || !page) throw new Error("not_found");

  const existing = await db.query.portfolioItem.findMany({
    columns: { id: true },
    where: eq(schema.portfolioItem.creatorPageId, page.id),
  });

  await db.insert(schema.portfolioItem).values({
    id: newId("port"),
    creatorPageId: page.id,
    mediaId,
    title: title.slice(0, 120),
    sortOrder: existing.length,
  });

  await db.update(schema.media).set({ status: "linked" }).where(eq(schema.media.id, mediaId));

  revalidatePath("/portfolio");
  if (user.handle) revalidatePath(`/${user.handle}`);
}

export async function removePortfolioItem(itemId: string) {
  const { user } = await requireCreator();
  const db = getDb();

  const page = await db.query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.userId, user.id),
  });
  if (!page) throw new Error("not_found");

  // จำกัดด้วย creatorPageId ด้วย — ไม่งั้นลบของคนอื่นได้ถ้ารู้ id
  await db
    .delete(schema.portfolioItem)
    .where(
      and(
        eq(schema.portfolioItem.id, itemId),
        eq(schema.portfolioItem.creatorPageId, page.id),
      ),
    );

  revalidatePath("/portfolio");
  if (user.handle) revalidatePath(`/${user.handle}`);
}
