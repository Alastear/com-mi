"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { requireCreator } from "@/lib/auth-guard";
import { parseEmbed, serializeEmbed } from "@/lib/media/embed";
import { isPublicKind } from "@/lib/media/kinds";
import { deleteObjects, headObject, publicUrl } from "@/lib/storage/r2";
import {
  affectedRows,
  claimIntent,
  lockStorage,
  planLimits,
  withinQuotaSql,
} from "@/lib/uploads/intent";

const IntentId = z.string().min(1).max(64);

const RegisterSchema = z.object({
  /** ได้มาจาก `startMediaUpload` — ชนิด ขนาด และที่อยู่ของไฟล์อยู่ในแถวนั้น ไม่ได้มาจาก client */
  intentId: IntentId,
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  thumbhash: z.string().max(200),
  /** วิดีโอ: ภาพปกกับความยาว — ไม่มีเมื่อเป็นรูป */
  posterIntentId: IntentId.nullish(),
  durationSeconds: z.number().int().positive().max(3600).nullish(),
});

export type RegisterMediaInput = z.infer<typeof RegisterSchema>;

export type RegisterMediaResult =
  | { ok: true; id: string }
  | { ok: false; error: "storage_quota_exceeded" };

/**
 * บันทึกไฟล์ที่เพิ่งอัปโหลดลงตาราง media
 *
 * เรียกจาก client หลัง PUT ไป R2 สำเร็จ (lib/uploads/client.ts)
 *
 * client ส่งมาแค่ id ของคำขออัปโหลด — ไม่มี URL หรือ path ให้แก้
 * เดิมรับ `url` จาก client ตรง ๆ ใครก็หยิบ URL รูปของร้านอื่นจาก `<img src>` มาอ้าง
 * เป็นของตัวเองได้ ต้องมีด่านกันไว้แยกต่างหาก ตอนนี้ช่องนั้นไม่มีอยู่แล้ว:
 * key ถูกสุ่มฝั่งเราและผูกกับคำขอที่ใช้ได้ครั้งเดียวของผู้ใช้คนนี้
 *
 * ขนาดตรวจกับไฟล์จริงในถังอีกรอบ — URL ที่เซ็นบังคับขนาดไว้แล้ว ถ้าไม่ตรงแปลว่า
 * ไฟล์ไม่เคยขึ้นไปถึง ไม่ใช่ว่าขึ้นไปผิดขนาด
 *
 * ⚠️ โควตาเต็ม **คืนค่า** ไม่ใช่โยน — Next ตัดข้อความของ error ที่โยนจาก Server Action
 * ทิ้งใน production ฝั่ง client จึงไม่มีทางรู้ว่าเป็นเรื่องโควตา แล้วบอกแค่ "ลองใหม่"
 * error อื่นที่ยังโยนอยู่ (not_found, not_uploaded) เป็นเรื่องที่ผู้ใช้แก้เองไม่ได้ ข้อความกลางพอ
 */
export async function registerMedia(input: RegisterMediaInput): Promise<RegisterMediaResult> {
  const { user } = await requireCreator();
  const v = RegisterSchema.parse(input);

  const file = await claimIntent(v.intentId, user.id, "public");
  if (!file || !isPublicKind(file.kind)) throw new Error("not_found");

  // ภาพปกของวิดีโอ — ต้องเป็นรูปของพอร์ตโฟลิโอที่คนเดียวกันเพิ่งขอไว้เท่านั้น
  const poster = v.posterIntentId ? await claimIntent(v.posterIntentId, user.id, "public") : null;
  if (v.posterIntentId && (!poster || poster.kind !== "portfolio" || poster.contentType !== "image/webp")) {
    throw new Error("not_found");
  }

  const [meta, posterMeta] = await Promise.all([
    headObject("public", file.key),
    poster ? headObject("public", poster.key) : null,
  ]);
  if (!meta || meta.bytes !== file.bytes) throw new Error("not_uploaded");
  if (poster && (!posterMeta || posterMeta.bytes !== poster.bytes)) throw new Error("not_uploaded");

  /**
   * ตรวจโควตาซ้ำใต้ lock ในคำสั่งเดียวกับ insert — ตอนขอ URL จองพื้นที่ไว้แล้ว
   * แต่คำขอถูกใช้ไปตั้งแต่ `claimIntent` (เลิกจอง) ระหว่างนั้นคำขออื่นของคนเดียวกันแทรกได้
   * เดิมอ่านยอดแล้วค่อย insert สองแท็บบันทึกพร้อมกันผ่านทั้งคู่ได้
   */
  const id = newId("med");
  const posterUrl = poster ? publicUrl(poster.key) : null;
  const [, inserted] = await getDb().batch([
    lockStorage(user.id),
    getDb().execute(sql`
      insert into media
        (id, owner_user_id, pathname, url, access, kind, content_type, bytes, width, height,
         thumbhash, poster_url, poster_pathname, duration_seconds, status)
      select ${id}::text, ${user.id}::text, ${file.key}::text, ${publicUrl(file.key)}::text,
             'public'::text, ${file.kind}::text, ${file.contentType}::text, ${file.bytes}::int,
             ${v.width}::int, ${v.height}::int, ${v.thumbhash}::text, ${posterUrl}::text,
             ${poster?.key ?? null}::text, ${v.durationSeconds ?? null}::int, 'orphan'::text
      where ${withinQuotaSql(user.id, file.bytes, planLimits(user.plan).storage_bytes)}
      returning id
    `),
  ]);
  // ยัง orphan จนกว่าจะถูกผูกกับ record จริง — cron เก็บกวาดตัวที่ค้างเกิน 24 ชม.

  if (affectedRows(inserted) === 0) {
    // ไฟล์ที่ทำให้เกินต้องถูกลบ ไม่ใช่ถูกบันทึก — ไม่มีแถวไหนชี้ถึง (key สุ่มใหม่ต่อคำขอ)
    await deleteObjects("public", poster ? [file.key, poster.key] : [file.key]).catch(() => {});
    return { ok: false, error: "storage_quota_exceeded" };
  }
  return { ok: true, id };
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

