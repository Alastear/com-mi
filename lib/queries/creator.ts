import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Read model ของหน้าร้าน
 *
 * TODO Phase 0-late: ครอบด้วย `use cache` + `cacheTag('creator:'+handle)` เมื่อเปิด cacheComponents
 * แล้วเรียก `updateTag()` ทุกครั้งที่ครีเอเตอร์กด save (docs/01-architecture.md §2)
 * ตอนนี้ยังไม่เปิดเพราะ traffic ยังเป็นศูนย์ และ cache ที่ invalidate ผิดแก้ยากกว่าไม่มี cache
 *
 * ห้ามอ่าน cookies/headers ในไฟล์นี้ — ตอนใส่ 'use cache' จะพังทันที
 */

export type ShopService = Awaited<ReturnType<typeof getShopByHandle>> extends infer T
  ? T extends { services: infer S }
    ? S extends readonly (infer U)[]
      ? U
      : never
    : never
  : never;

export async function getShopByHandle(handle: string) {
  const db = getDb();

  const owner = await db.query.user.findFirst({
    columns: { id: true, name: true, image: true, handle: true },
    where: eq(schema.user.handle, handle.toLowerCase()),
  });
  if (!owner) return null;

  const page = await db.query.creatorPage.findFirst({
    where: eq(schema.creatorPage.userId, owner.id),
    with: {
      banner: true,
      avatar: true,
      services: {
        where: and(eq(schema.service.isActive, true), isNull(schema.service.deletedAt)),
        orderBy: [asc(schema.service.sortOrder)],
        with: {
          cover: true,
          tiers: {
            orderBy: [asc(schema.serviceTier.sortOrder)],
            with: { preview: true },
          },
          options: { orderBy: [asc(schema.serviceOption.sortOrder)] },
        },
      },
      portfolio: {
        orderBy: [asc(schema.portfolioItem.sortOrder)],
        with: { media: true },
      },
    },
  });
  if (!page) return null;

  return { owner, ...page };
}

/** ใช้ตอนตัดสิน 404 ที่ layout — ตั้งใจให้เบาที่สุด ไม่ join อะไรเลย */
export async function shopExists(handle: string): Promise<boolean> {
  const db = getDb();
  const row = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(schema.user.handle, handle.toLowerCase()),
  });
  return Boolean(row);
}

export async function getServiceBySlug(handle: string, slug: string) {
  const shop = await getShopByHandle(handle);
  if (!shop) return null;
  const svc = shop.services.find((s) => s.slug === slug);
  return svc ? { shop, service: svc } : null;
}

/** หน้าร้านของผู้ใช้ที่ล็อกอินอยู่ (ฝั่ง backoffice — เห็นทั้งที่ยังไม่ publish และ service ที่ปิดอยู่) */
export async function getOwnShop(userId: string) {
  const db = getDb();
  return db.query.creatorPage.findFirst({
    where: eq(schema.creatorPage.userId, userId),
    with: {
      banner: true,
      avatar: true,
      services: {
        where: isNull(schema.service.deletedAt),
        orderBy: [asc(schema.service.sortOrder)],
        with: {
          cover: true,
          tiers: {
            orderBy: [asc(schema.serviceTier.sortOrder)],
            with: { preview: true },
          },
          options: { orderBy: [asc(schema.serviceOption.sortOrder)] },
        },
      },
      portfolio: {
        orderBy: [asc(schema.portfolioItem.sortOrder)],
        with: { media: true },
      },
    },
  });
}
