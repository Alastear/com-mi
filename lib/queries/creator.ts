import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { normalizeHandle } from "@/lib/handles";

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
    where: eq(schema.user.handle, normalizeHandle(handle)),
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

/**
 * ครีเอเตอร์ที่ขึ้นหน้าค้นหาได้
 *
 * ตัดร้านตัวอย่างออกด้วย `isDemo` — ร้าน seed มีไว้ให้กดดูจากหน้าแรกหน้าเดียว
 * ถ้าปล่อยขึ้นหน้าค้นหา marketplace จะดูเหมือนมีคนใช้ทั้งที่ยังไม่มี
 *
 * ดึงเมนูถูกสุดกับผลงาน 4 ชิ้นแรกมาด้วยเพื่อวาดการ์ด — จำกัดจำนวนตั้งแต่ใน query
 * ไม่ใช่ดึงมาทั้งหมดแล้วค่อย slice ทิ้งฝั่ง JS
 */
export async function listPublicShops(
  limit = 24,
  filter?: { q?: string; kind?: string },
) {
  const db = getDb();

  const q = filter?.q?.trim();
  const kind = filter?.kind?.trim();

  /**
   * ค้นหาแบบ ILIKE บนชื่อร้านกับคำโปรย
   *
   * ⚠️ **นี่คือคอขวดตัวถัดไป และรู้ตัวไว้แล้ว**
   * `%คำ%` มี wildcard นำหน้า btree index จึงใช้ไม่ได้เลย ต้องอ่านทุกแถวเสมอ
   * ส่วนการ "เรียงและกรอง" มี creator_page_public_idx รองรับแล้ว
   * (วัดที่ 50,000 ร้าน: มี index อ่าน 24 แถว 0.04 ms · ไม่มี index อ่านทั้งตาราง)
   *
   * ไม่แก้ตอนนี้เพราะยังไม่รู้ว่าคนค้นด้วยคำแบบไหน และการเดาผิดแพงกว่ารอ
   * **จุดที่ต้องกลับมาแก้:** ร้านเผยแพร่แล้วเกิน ~5,000 หรือหน้าค้นหาช้าเกิน 300 ms
   * **วิธีแก้ที่เตรียมไว้:** เปิด pg_trgm แล้วทำ GIN index — รองรับ wildcard นำหน้า
   *   และตัดคำไทยได้ดีกว่า tsvector ที่ต้องมีพจนานุกรมแยก
   *     CREATE EXTENSION IF NOT EXISTS pg_trgm;
   *     CREATE INDEX creator_page_search_idx ON creator_page
   *       USING gin ((display_name || ' ' || tagline) gin_trgm_ops)
   *       WHERE is_published AND NOT is_demo;
   */
  const conditions = [
    eq(schema.creatorPage.isPublished, true),
    eq(schema.creatorPage.isDemo, false),
  ];
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(schema.creatorPage.displayName, pattern),
        ilike(schema.creatorPage.tagline, pattern),
      )!,
    );
  }
  if (kind) {
    /**
     * ⚠️ ต้องเป็น subquery ที่ **ไม่อ้างถึงตารางนอก**
     *
     * `exists()` ที่อ้าง `creatorPage.id` จากข้างในใช้ไม่ได้กับ `db.query.*`
     * เพราะ relational query ตั้ง alias ให้ตารางราก ชื่อเดิมจึงอ้างไม่ถึง
     * ("invalid reference to FROM-clause entry") — กับดักเดียวกับ `extras`
     *
     * แบบนี้เลือก id ของร้านที่มีเมนูชนิดนั้นออกมาก่อน แล้วค่อยกรอง
     * ยังเป็น SQL คำสั่งเดียวและไม่ทำให้ร้านซ้ำแบบ join
     */
    conditions.push(
      inArray(
        schema.creatorPage.id,
        db
          .selectDistinct({ id: schema.service.creatorPageId })
          .from(schema.service)
          .where(
            and(
              eq(schema.service.kind, kind),
              eq(schema.service.isActive, true),
              isNull(schema.service.deletedAt),
            ),
          ),
      ),
    );
  }

  return db.query.creatorPage.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.creatorPage.updatedAt)],
    limit,
    columns: { id: true, displayName: true, tagline: true, status: true },
    with: {
      user: { columns: { handle: true } },
      banner: { columns: { url: true } },
      avatar: { columns: { url: true } },
      services: {
        where: and(eq(schema.service.isActive, true), isNull(schema.service.deletedAt)),
        orderBy: [asc(schema.service.basePriceCents)],
        limit: 2,
        columns: { id: true, title: true, basePriceCents: true },
      },
      portfolio: {
        orderBy: [asc(schema.portfolioItem.sortOrder)],
        limit: 4,
        columns: { id: true, title: true },
        with: { media: { columns: { url: true } } },
      },
    },
  });
}

/** ใช้ตอนตัดสิน 404 ที่ layout — ตั้งใจให้เบาที่สุด ไม่ join อะไรเลย */
export async function shopExists(handle: string): Promise<boolean> {
  const db = getDb();
  const row = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(schema.user.handle, normalizeHandle(handle)),
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
