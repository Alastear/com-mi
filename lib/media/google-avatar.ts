import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { startMediaUpload, cancelUpload } from "@/lib/uploads/actions";
import { registerMedia } from "@/lib/media/actions";
import { lockStorage } from "@/lib/uploads/intent";
import { orphanUnreferenced } from "@/lib/media/references";

/** Copy Google's profile photo into our store before publishing a shop. */
export async function importGoogleAvatar(userId: string): Promise<boolean> {
  const db = getDb();
  const [user, page] = await Promise.all([
    db.query.user.findFirst({ where: eq(schema.user.id, userId), columns: { image: true } }),
    db.query.creatorPage.findFirst({ where: eq(schema.creatorPage.userId, userId), columns: { avatarMediaId: true } }),
  ]);
  if (page?.avatarMediaId || !user?.image) return true;
  const source = new URL(user.image);
  if (source.protocol !== "https:" || !source.hostname.endsWith(".googleusercontent.com") || source.port || source.username || source.password) return true;
  source.pathname = source.pathname.replace(/=s\d+[^/]*$/, "") + "=s256-c";
  const res = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(10000) });
  const contentType = res.headers.get("content-type")?.split(";")[0];
  if (!res.ok || !contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType) || !res.body) return false;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 2 * 1024 ** 2) { await reader.cancel(); return false; }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  const start = await startMediaUpload({ kind: "avatar", contentType, bytes: bytes.length });
  if (!start.ok) return false;
  try {
    const put = await fetch(start.url, { method: "PUT", headers: start.headers, body: bytes, signal: AbortSignal.timeout(15000) });
    if (!put.ok) throw new Error("avatar_upload_failed");
    const media = await registerMedia({ intentId: start.intentId, width: 256, height: 256, thumbhash: "" });
    if (!media.ok) return false;
    await db.batch([
      lockStorage(userId),
      db.update(schema.creatorPage).set({ avatarMediaId: media.id, updatedAt: new Date() })
        .where(and(eq(schema.creatorPage.userId, userId), isNull(schema.creatorPage.avatarMediaId))),
      db.update(schema.media).set({ status: "linked" }).where(and(eq(schema.media.id, media.id), eq(schema.media.ownerUserId, userId))),
      orphanUnreferenced(userId),
    ]);
    return true;
  } catch (err) { await cancelUpload(start.intentId).catch(() => {}); throw err; }
}
