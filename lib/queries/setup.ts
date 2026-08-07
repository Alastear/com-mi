import { and, count, eq, inArray, isNull, sum } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ACTIVE_STATUSES } from "@/lib/types";

/**
 * ความคืบหน้าการตั้งค่าร้าน — "journey" ของครีเอเตอร์ใหม่
 *
 * ตั้งใจให้เป็น **เช็กลิสต์ที่อ่านจากสถานะจริง** ไม่ใช่ทัวร์ที่กดข้ามได้แล้วหายไป
 * เหตุผล: ทัวร์แบบ modal คนกดข้ามเกือบหมด แล้วก็ยังไม่รู้อยู่ดีว่าต้องทำอะไรต่อ
 * ส่วนเช็กลิสต์ที่ผูกกับข้อมูลจริงจะติ๊กเองเมื่อทำเสร็จ และหายไปเองเมื่อครบ
 * ถ้าครีเอเตอร์ลบเมนูทิ้งทีหลัง ข้อนั้นก็กลับมาไม่ติ๊ก ซึ่งถูกต้องตามความเป็นจริง
 *
 * ลำดับสำคัญ: เรียงตามสิ่งที่ลูกค้าเห็นก่อน-หลังเวลาเปิดหน้าร้าน
 * และ "เผยแพร่" อยู่ท้ายสุดเสมอ เพราะเป็นก้าวที่ทำให้ร้านออกสู่สาธารณะจริง
 */

export type SetupStepId =
  | "identity"
  | "avatar"
  | "banner"
  | "service"
  | "portfolio"
  | "payout"
  | "terms"
  | "publish";

export type SetupStep = {
  id: SetupStepId;
  done: boolean;
  /** ข้อที่ต้องทำก่อนถึงจะกดเผยแพร่ได้จริง */
  required: boolean;
  href: string;
};

export type SetupProgress = {
  steps: SetupStep[];
  doneCount: number;
  total: number;
  /** ทำครบทุกข้อที่จำเป็นแล้วหรือยัง */
  complete: boolean;
  isPublished: boolean;
};

export async function getSetupProgress(userId: string): Promise<SetupProgress | null> {
  const db = getDb();

  const page = await db.query.creatorPage.findFirst({
    where: eq(schema.creatorPage.userId, userId),
    columns: {
      id: true,
      displayName: true,
      tagline: true,
      bannerMediaId: true,
      avatarMediaId: true,
      promptpayId: true,
      tos: true,
      isPublished: true,
    },
  });
  if (!page) return null;

  // นับสองอย่างพร้อมกัน — ไม่ต้องดึงแถวจริงมาเพราะใช้แค่ "มีไหม"
  const [[services], [portfolio]] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.service)
      .where(
        and(
          eq(schema.service.creatorPageId, page.id),
          isNull(schema.service.deletedAt),
          eq(schema.service.isActive, true),
        ),
      ),
    db
      .select({ n: count() })
      .from(schema.portfolioItem)
      .where(eq(schema.portfolioItem.creatorPageId, page.id)),
  ]);

  const steps: SetupStep[] = [
    {
      id: "identity",
      // ชื่อร้านมีมาตั้งแต่ onboarding แล้ว ข้อนี้จึงวัดที่ "คำโปรย" ซึ่งต้องเขียนเอง
      done: page.tagline.trim().length > 0,
      required: true,
      href: "/shop",
    },
    { id: "avatar", done: Boolean(page.avatarMediaId), required: true, href: "/shop" },
    { id: "banner", done: Boolean(page.bannerMediaId), required: false, href: "/shop" },
    { id: "service", done: services.n > 0, required: true, href: "/services" },
    { id: "portfolio", done: portfolio.n > 0, required: false, href: "/portfolio" },
    { id: "payout", done: Boolean(page.promptpayId), required: true, href: "/settings" },
    /**
     * ข้อตกลงไม่ได้ใส่ให้ตั้งแต่สร้างร้านแล้ว (ดูเหตุผลใน lib/shop/ensure.ts)
     * จึงต้องมีข้อนี้คอยเตือน ไม่งั้นจะเปิดร้านรับงานจริงโดยไม่มีข้อตกลงเลย
     * บังคับเป็น required เพราะเวลามีเรื่อง ข้อตกลงคือสิ่งเดียวที่ครีเอเตอร์ใช้อ้างได้
     */
    { id: "terms", done: page.tos.length > 0, required: true, href: "/shop" },
    { id: "publish", done: page.isPublished, required: true, href: "/shop" },
  ];

  return {
    steps,
    doneCount: steps.filter((s) => s.done).length,
    total: steps.length,
    // ไม่นับ "เผยแพร่" เป็นเงื่อนไขของตัวเอง — ไม่งั้นจะกดเผยแพร่ไม่ได้ตลอดกาล
    complete: steps.filter((s) => s.required && s.id !== "publish").every((s) => s.done),
    isPublished: page.isPublished,
  };
}

/**
 * ตัวเลขสำหรับแดชบอร์ดและการ์ดโควตา
 *
 * รวมไว้ที่เดียวเพื่อยิงทีเดียวจบ — ก่อนหน้านี้แดชบอร์ดใช้ตัวเลขปลอมทั้งหมด
 * (พื้นที่ 96 MB, เมนู 5 รายการ) ซึ่งไม่ตรงกับของจริงของใครเลย
 */
export type CreatorStats = {
  activeOrders: number;
  services: number;
  storageBytes: number;
};

export async function getCreatorStats(userId: string, pageId: string): Promise<CreatorStats> {
  const db = getDb();

  const [[services], [storage], [active]] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.service)
      .where(and(eq(schema.service.creatorPageId, pageId), isNull(schema.service.deletedAt))),
    // พื้นที่นับจากไฟล์ที่ผู้ใช้เป็นเจ้าของจริง ไม่ใช่ค่าคงที่
    db
      .select({ n: sum(schema.media.bytes) })
      .from(schema.media)
      .where(eq(schema.media.ownerUserId, userId)),
    db
      .select({ n: count() })
      .from(schema.order)
      .where(
        and(
          eq(schema.order.creatorPageId, pageId),
          inArray(schema.order.status, [...ACTIVE_STATUSES]),
        ),
      ),
  ]);

  return {
    activeOrders: active.n,
    services: services.n,
    // sum() คืน null เมื่อไม่มีแถว และคืนเป็น string เพราะ bigint
    storageBytes: Number(storage.n ?? 0),
  };
}
