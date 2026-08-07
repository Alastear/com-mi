import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";

/**
 * รับประกันว่าผู้ใช้ที่มี handle แล้วต้องมีหน้าร้านเสมอ
 *
 * เรียกได้ทั้งตอน onboarding และตอนเปิดหน้า /shop — idempotent
 * ที่ต้องมีเพราะสองสถานการณ์:
 *   1. ผู้ใช้จาก Phase 0 ที่ตั้ง handle ไว้ก่อนตาราง creator_page จะมี
 *   2. onboarding ล้มกลางคัน (ตั้ง handle สำเร็จแต่สร้างร้านไม่ทัน)
 * ถ้าไม่มีตัวนี้ ทั้งสองเคสจะเจอ 404 ตายตัวที่ /shop โดยแก้เองไม่ได้
 *
 * ⚠️ **สร้างร้านเปล่า ไม่ใส่เนื้อหาอะไรให้เลย** — ทั้งเมนู คำโปรย และข้อตกลง
 * เดิมยัดเมนูตัวอย่าง 3 รายการให้ทุกคน ผลคือครีเอเตอร์ใหม่เปิดเข้ามาแล้วเจอ
 * "ภาพครึ่งตัว/ภาพเต็มตัว/ภาพชิบิ" พร้อมราคาที่ไม่ใช่ของตัวเอง แยกไม่ออกว่า
 * อันไหนของจริงอันไหนตัวอย่าง และถ้าเผลอกดเผยแพร่ก็รับงานตามราคาที่ไม่เคยตั้งเอง
 *
 * ข้อตกลงก็ตกอยู่ในกับดักเดียวกันและตามมาทีหลัง — "มัดจำ 50%" กับ
 * "ห้ามใช้เชิงพาณิชย์" ผูกพันจริงพอ ๆ กับราคา ต่างกันแค่ไม่ใช่ตัวเลข
 * ร่างตั้งต้นยังอยู่ที่ `starterTos` แต่ย้ายไปเป็นปุ่มให้กดใส่เองที่หน้า /shop
 * และมีข้อในเช็กลิสต์คอยเตือน จะได้อ่านก่อนที่มันจะกลายเป็นข้อตกลงของตัวเอง
 */
export async function ensureShop(userId: string, displayName: string) {
  const db = getDb();

  const existing = await db.query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.userId, userId),
  });
  if (existing) return existing.id;

  const pageId = newId("page");

  await db.insert(schema.creatorPage).values({
    id: pageId,
    userId,
    displayName,
    // ปล่อยว่างไว้ให้ครีเอเตอร์เขียนเอง — คำโปรยสำเร็จรูปจะไปโผล่บนหน้าร้านจริง
    // และทำให้เช็กลิสต์ติ๊กเองทั้งที่เจ้าของยังไม่ได้แตะ
    tagline: "",
    tos: [],
    // ยังไม่ publish จนกว่าครีเอเตอร์จะกดเอง — กันหน้าร้านเปล่า ๆ หลุดออกไป
    isPublished: false,
  });

  return pageId;
}
