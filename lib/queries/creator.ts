import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * ⚠️ Next **ไม่ถอด** percent-encoding ให้ใน `params`
 *
 * `/@somchai/s/วาดภาพครึ่งตัว` มาถึงเป็น "%E0%B8%A7%E0%B8%B2..." ตรง ๆ
 * ถ้าเอาไปเทียบกับ slug ใน DB จะไม่มีวันตรง → หน้าเมนูภาษาไทยขึ้น 404 ทั้งหมด
 * ส่วน slug ภาษาอังกฤษไม่มีอะไรให้เข้ารหัส เลยผ่านฉลุยและปิดบั๊กนี้ไว้
 *
 * ถอดที่ชั้น query จุดเดียว เพราะ params ถูกอ่านหลายที่ (page, generateMetadata,
 * layout, opengraph-image) — ถ้าให้แต่ละที่ถอดเอง ลืมที่เดียวก็พังเฉพาะทางนั้น
 * ค่าที่ถอดแล้วส่งซ้ำได้ปลอดภัย: ข้อความไทยไม่มี % จึงไม่โดนถอดซ้ำ
 */
function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // ลำดับ % ที่ผิดรูป (เช่น "%zz") ทำให้ decodeURIComponent โยน URIError
    // ปกติ Next ปัด URL แบบนั้นทิ้งเป็น 400 ตั้งแต่ก่อนถึงตรงนี้ แต่ฟังก์ชันนี้
    // ถูกเรียกจากที่อื่นที่ไม่ใช่ params ได้ด้วย — คืนค่าดิบให้ไปไม่เจอใน DB แล้ว 404
    return value;
  }
}

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
    where: eq(schema.user.handle, decodeParam(handle).toLowerCase()),
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
    where: eq(schema.user.handle, decodeParam(handle).toLowerCase()),
  });
  return Boolean(row);
}

export async function getServiceBySlug(handle: string, slug: string) {
  const shop = await getShopByHandle(handle);
  if (!shop) return null;
  const wanted = decodeParam(slug);
  const svc = shop.services.find((s) => s.slug === wanted);
  return svc ? { shop, service: svc } : null;
}

/**
 * เมนูเดียวสำหรับหน้าแก้ไข — จำกัดด้วย userId ในคิวรีเดียว
 * ถ้าแยกเป็นอ่านก่อนแล้วค่อยเช็คเจ้าของทีหลัง จะพลาดได้ง่ายเวลามีคนแก้โค้ดต่อ
 */
export async function getOwnService(userId: string, serviceId: string) {
  const db = getDb();

  const page = await db.query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.userId, userId),
  });
  if (!page) return null;

  const svc = await db.query.service.findFirst({
    where: and(
      eq(schema.service.id, serviceId),
      eq(schema.service.creatorPageId, page.id),
      isNull(schema.service.deletedAt),
    ),
    with: {
      cover: true,
      tiers: { orderBy: [asc(schema.serviceTier.sortOrder)] },
      options: { orderBy: [asc(schema.serviceOption.sortOrder)] },
    },
  });
  return svc ?? null;
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
