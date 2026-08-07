import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import type { Locale } from "@/lib/i18n/config";
import { starterShop } from "@/lib/templates/starter-shop";

/**
 * รับประกันว่าผู้ใช้ที่มี handle แล้วต้องมีหน้าร้านเสมอ
 *
 * เรียกได้ทั้งตอน onboarding และตอนเปิดหน้า /shop — idempotent
 * ที่ต้องมีเพราะสองสถานการณ์:
 *   1. ผู้ใช้จาก Phase 0 ที่ตั้ง handle ไว้ก่อนตาราง creator_page จะมี
 *   2. onboarding ล้มกลางคัน (ตั้ง handle สำเร็จแต่สร้างร้านไม่ทัน)
 * ถ้าไม่มีตัวนี้ ทั้งสองเคสจะเจอ 404 ตายตัวที่ /shop โดยแก้เองไม่ได้
 *
 * ⚠️ **ไม่สร้างเมนูตั้งต้นให้** — เดิมยัดเมนูตัวอย่าง 3 รายการให้ทุกคน
 * ผลคือครีเอเตอร์ใหม่เปิดเข้ามาแล้วเจอ "ภาพครึ่งตัว/ภาพเต็มตัว/ภาพชิบิ" พร้อมราคา
 * ที่ไม่ใช่ของตัวเอง แยกไม่ออกว่าอันไหนของจริงอันไหนตัวอย่าง และถ้าเผลอกดเผยแพร่
 * ก็จะรับงานตามราคาที่ไม่เคยตั้งเอง — ให้เริ่มจากศูนย์แล้วมีเช็กลิสต์พาทำแทน
 *
 * ส่วน TOS ยังใส่ร่างตั้งต้นให้ เพราะร้านที่ไม่มีข้อตกลงเลยคือความเสี่ยงของครีเอเตอร์เอง
 * เป็นข้อความล้วนที่แก้ทับได้ทันทีที่หน้า /shop ไม่ใช่ของที่ต้องลบทิ้งก่อนใช้งาน
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
    // ปล่อยว่างไว้ให้ครีเอเตอร์เขียนเอง — คำโปรยสำเร็จรูปจะไปโผล่บนหน้าร้านจริง
    // และทำให้เช็กลิสต์ติ๊กเองทั้งที่เจ้าของยังไม่ได้แตะ
    tagline: "",
    tos: seed.tos,
    // ยังไม่ publish จนกว่าครีเอเตอร์จะกดเอง — กันหน้าร้านเปล่า ๆ หลุดออกไป
    isPublished: false,
  });

  return pageId;
}
