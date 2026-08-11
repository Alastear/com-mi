import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { isOrderCode } from "@/lib/orders/code";

/**
 * Read model ของออเดอร์
 *
 * ⚠️ ฝั่งลูกค้าใช้ **whitelist** ไม่ใช่ตัดคอลัมน์ลับออกทีหลัง
 * เพราะถ้าเพิ่มคอลัมน์ลับใหม่ในอนาคต แบบ blacklist จะหลุดออกไปทันทีโดยไม่มีใครรู้
 * ส่วนแบบนี้ต้องเดินมาเติมชื่อคอลัมน์เองถึงจะโผล่ (ตอนนี้ที่ต้องกันคือ `privateNote`)
 *
 * ⚠️ กฎ whitelist ใช้กับ `with:` ด้วย ไม่ใช่แค่คอลัมน์ชั้นบน
 * แถวที่ join มาก็ข้าม boundary ไปฝั่ง client เหมือนกัน — `delivery` ต้องไม่พก
 * อะไรที่ชี้ตำแหน่งไฟล์จริงติดไปด้วย
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
      depositCents: true,
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
        columns: {
          id: true,
          displayName: true,
          userId: true,
          // ฝั่งลูกค้าต้องใช้สร้าง QR — เป็นข้อมูลที่ครีเอเตอร์ตั้งใจเปิดเผยให้คนจ่าย
          promptpayType: true,
          promptpayId: true,
          promptpayName: true,
        },
        with: { user: { columns: { handle: true, name: true, image: true } } },
      },
      payments: { orderBy: [asc(schema.paymentRecord.createdAt)] },
      deliveries: {
        orderBy: [asc(schema.delivery.createdAt)],
        columns: { id: true, note: true, licenseType: true, releasedAt: true, mediaIds: true },
      },
      messages: {
        orderBy: [asc(schema.message.createdAt)],
        with: { sender: { columns: { name: true, image: true } } },
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
      depositCents: true,
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
        page: { columns: { promptpayId: true } },
        // เธรดกับ timeline อยู่ตารางเดียวกัน เรียงตามเวลาแล้วได้ทั้งสองอย่างพร้อมกัน
        messages: {
          orderBy: [asc(schema.message.createdAt)],
          with: { sender: { columns: { name: true, image: true } } },
        },
        payments: { orderBy: [asc(schema.paymentRecord.createdAt)] },
        deliveries: {
          orderBy: [asc(schema.delivery.createdAt)],
          columns: { id: true, note: true, licenseType: true, releasedAt: true, mediaIds: true },
        },
      },
    })) ?? null
  );
}

/**
 * ใบเสนอราคาที่ยังเปิดอยู่ของออเดอร์นี้ — มีได้ใบเดียว (partial unique index บังคับไว้)
 *
 * ใบที่ถูกปิดหรือยอมรับไปแล้วไม่คืนมา เพราะหน้าจอมีหน้าที่แสดง "ข้อเสนอที่ยังกดได้"
 * ประวัติใบเก่าอ่านได้จาก timeline ซึ่งมี event ทุกครั้งที่ออกใบ
 */
export async function getLiveQuote(orderId: string) {
  const row = await getDb().query.orderQuote.findFirst({
    where: and(
      eq(schema.orderQuote.orderId, orderId),
      isNull(schema.orderQuote.supersededAt),
      isNull(schema.orderQuote.acceptedAt),
    ),
    orderBy: [desc(schema.orderQuote.createdAt)],
  });
  if (!row) return null;

  /**
   * เทียบเวลาหมดอายุที่นี่ ไม่ใช่ตอน render
   *
   * `Date.now()` ระหว่าง render เป็นฟังก์ชันที่ให้ผลไม่คงที่ — React ห้ามไว้
   * และคอมโพเนนต์ฝั่งลูกค้าก็เทียบเองไม่ได้ เพราะ HTML จากเซิร์ฟเวอร์กับจากเบราว์เซอร์
   * จะไม่ตรงกัน ตรงนี้เป็นแค่การอ่านข้อมูล ไม่ใช่ render จึงเป็นที่ที่ถูกต้อง
   *
   * ยังคืนใบที่หมดอายุมาด้วย ไม่ได้กรองทิ้ง — ลูกค้าควรเห็นว่ามีใบอยู่แต่หมดอายุแล้ว
   * ดีกว่าเปิดมาแล้วใบหายไปเฉย ๆ โดยไม่มีคำอธิบาย
   */
  return { ...row, expired: Boolean(row.expiresAt && row.expiresAt.getTime() <= Date.now()) };
}
