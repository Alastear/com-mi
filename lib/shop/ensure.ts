import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import type { Locale } from "@/lib/i18n/config";
import { STARTER_TAGLINE, starterShop } from "@/lib/templates/starter-shop";

/**
 * รับประกันว่าผู้ใช้ที่มี handle แล้วต้องมีหน้าร้านเสมอ
 *
 * เรียกได้ทั้งตอน onboarding และตอนเปิดหน้า /shop — idempotent
 * ที่ต้องมีเพราะสองสถานการณ์:
 *   1. ผู้ใช้จาก Phase 0 ที่ตั้ง handle ไว้ก่อนตาราง creator_page จะมี
 *   2. onboarding ล้มกลางคัน (ตั้ง handle สำเร็จแต่สร้างร้านไม่ทัน)
 * ถ้าไม่มีตัวนี้ ทั้งสองเคสจะเจอ 404 ตายตัวที่ /shop โดยแก้เองไม่ได้
 */
export async function ensureShop(userId: string, displayName: string, locale: Locale) {
  const db = getDb();

  const existing = await db.query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.userId, userId),
  });
  if (existing) return existing.id;

  const seed = starterShop(locale);
  const pageId = newId("page");

  await db.insert(schema.creatorPage).values({
    id: pageId,
    userId,
    displayName,
    tagline: STARTER_TAGLINE[locale],
    tos: seed.tos,
    // ยังไม่ publish จนกว่าครีเอเตอร์จะกดเอง — กันหน้าร้านเปล่า ๆ หลุดออกไป
    isPublished: false,
  });

  for (const [i, s] of seed.services.entries()) {
    const serviceId = newId("svc");
    await db.insert(schema.service).values({
      id: serviceId,
      creatorPageId: pageId,
      slug: s.slug,
      title: s.title,
      description: s.description,
      kind: s.kind,
      mode: s.mode,
      basePriceCents: s.basePriceCents,
      deliveryDays: s.deliveryDays,
      revisionsIncluded: s.revisionsIncluded,
      includes: s.includes,
      sortOrder: i,
    });

    if (s.tiers.length) {
      await db.insert(schema.serviceTier).values(
        s.tiers.map((t, ti) => ({
          id: newId("tier"),
          serviceId,
          label: t.label,
          priceDeltaCents: t.priceDeltaCents,
          sortOrder: ti,
        })),
      );
    }
    if (s.options.length) {
      await db.insert(schema.serviceOption).values(
        s.options.map((o, oi) => ({
          id: newId("opt"),
          serviceId,
          groupLabel: o.groupLabel,
          label: o.label,
          priceDeltaCents: o.priceDeltaCents,
          inputType: o.inputType,
          maxQuantity: o.maxQuantity ?? null,
          sortOrder: oi,
        })),
      );
    }
  }

  return pageId;
}
