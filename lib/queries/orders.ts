import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { isOrderCode } from "@/lib/orders/code";

/**
 * Read model ของออเดอร์
 *
 * ⚠️ ฝั่งลูกค้าใช้ **whitelist** ไม่ใช่ตัดคอลัมน์ลับออกทีหลัง
 * เพราะถ้าเพิ่มคอลัมน์ลับใหม่ในอนาคต แบบ blacklist จะหลุดออกไปทันทีโดยไม่มีใครรู้
 * ส่วนแบบนี้ต้องเดินมาเติมชื่อคอลัมน์เองถึงจะโผล่ (ตอนนี้ที่ต้องกันคือ `privateNote`)
 *
 * `with` เขียนซ้ำในแต่ละฟังก์ชันโดยตั้งใจ — ดึงออกไปเป็นตัวแปรกลางแล้ว
 * TypeScript จะขยาย `columns: { title: true }` เป็น `boolean` ทำให้ type
 * ของผลลัพธ์กลายเป็น optional ทั้งก้อน แล้วโค้ดที่เรียกใช้พังหมด
 */

/** ออเดอร์ที่ผู้ใช้คนนี้เป็น "ลูกค้า" — ใช้ในหน้า /my/requests */
export async function getOrderForClient(code: string, clientUserId: string) {
  // กันการยิง query ด้วย code มั่ว ๆ ทีละพันครั้ง
  if (!isOrderCode(code)) return null;

  return (await getDb().query.order.findFirst({
    where: and(eq(schema.order.code, code), eq(schema.order.clientUserId, clientUserId)),
    columns: {
      id: true,
      code: true,
      status: true,
      currency: true,
      subtotalCents: true,
      addonsCents: true,
      discountCents: true,
      totalCents: true,
      amountPaidCents: true,
      revisionsUsed: true,
      revisionsAllowed: true,
      tosSnapshot: true,
      acceptedTosAt: true,
      dueAt: true,
      quoteExpiresAt: true,
      isPublicInQueue: true,
      createdAt: true,
      completedAt: true,
    },
    with: {
      items: { orderBy: [asc(schema.orderItem.sortOrder)] },
      answers: { orderBy: [asc(schema.orderAnswer.sortOrder)] },
      service: { columns: { slug: true, title: true, deliveryDays: true } },
      page: {
        columns: { id: true, displayName: true, userId: true },
        with: { user: { columns: { handle: true, name: true, image: true } } },
      },
    },
  })) ?? null;
}

/** รายการคำขอทั้งหมดของลูกค้าคนนี้ */
export async function listOrdersForClient(clientUserId: string) {
  return getDb().query.order.findMany({
    where: eq(schema.order.clientUserId, clientUserId),
    orderBy: [desc(schema.order.createdAt)],
    columns: {
      id: true,
      code: true,
      status: true,
      totalCents: true,
      currency: true,
      createdAt: true,
      dueAt: true,
    },
    with: {
      service: { columns: { title: true } },
      page: { columns: { displayName: true }, with: { user: { columns: { handle: true } } } },
    },
  });
}

/**
 * ออเดอร์ทั้งหมดบนบอร์ดของครีเอเตอร์
 *
 * ดึงครั้งเดียวแล้วให้ฝั่ง client แบ่งคอลัมน์เอง — บอร์ดมีไม่กี่สิบใบ
 * ยิงทีละคอลัมน์จะกลายเป็นห้า query ที่ตอบช้ากว่าเดิมโดยไม่ได้อะไรกลับมา
 *
 * เอาเฉพาะฟิลด์ที่การ์ดใช้จริง ไม่ดึงทั้งแถว — `tosSnapshot` อย่างเดียว
 * ก็หนักกว่าทุกฟิลด์ที่เหลือรวมกันแล้ว และบอร์ดไม่ได้ใช้
 */
export async function listOrdersForBoard(creatorUserId: string) {
  const db = getDb();

  const page = await db.query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.userId, creatorUserId),
  });
  if (!page) return [];

  return db.query.order.findMany({
    where: eq(schema.order.creatorPageId, page.id),
    orderBy: [desc(schema.order.priority), desc(schema.order.createdAt)],
    columns: {
      id: true,
      code: true,
      status: true,
      priority: true,
      currency: true,
      totalCents: true,
      amountPaidCents: true,
      revisionsUsed: true,
      revisionsAllowed: true,
      dueAt: true,
      createdAt: true,
      completedAt: true,
    },
    with: {
      // ชื่อที่แช่ไว้ตอนสั่ง — บรรทัด base คือชื่อเมนู ณ ตอนนั้น
      items: { where: eq(schema.orderItem.kind, "base"), limit: 1, columns: { label: true } },
      service: { columns: { title: true } },
      client: { columns: { name: true, image: true } },
    },
  });
}

/** ออเดอร์ที่ผู้ใช้คนนี้เป็น "ครีเอเตอร์" — เห็นทุกอย่างรวมโน้ตส่วนตัว */
export async function getOrderForCreator(code: string, creatorUserId: string) {
  if (!isOrderCode(code)) return null;
  const db = getDb();

  const page = await db.query.creatorPage.findFirst({
    columns: { id: true },
    where: eq(schema.creatorPage.userId, creatorUserId),
  });
  if (!page) return null;

  return (
    (await db.query.order.findFirst({
      where: and(eq(schema.order.code, code), eq(schema.order.creatorPageId, page.id)),
      with: {
        items: { orderBy: [asc(schema.orderItem.sortOrder)] },
        answers: { orderBy: [asc(schema.orderAnswer.sortOrder)] },
        service: { columns: { slug: true, title: true, deliveryDays: true } },
        client: { columns: { name: true, image: true, email: true } },
      },
    })) ?? null
  );
}
