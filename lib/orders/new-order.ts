import { and, count, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/id";
import { effectivePlan, PLANS, type PlanId } from "@/lib/billing/plans";
import { ACTIVE_STATUSES } from "@/lib/types";
import { generateOrderCode } from "./code";
import type { PriceLine } from "./pricing";

/**
 * ออเดอร์ใหม่เกิดขึ้นได้ที่นี่ที่เดียว
 *
 * ⚠️ **ห้ามมีทางสร้างออเดอร์ทางที่สอง** — เดิมกฎทั้งหมดอยู่ในตัว `createOrder`
 * ซึ่งอ่านฟอร์มบรีฟด้วย พอมีทางที่สอง (ใบเชิญลูกค้า) จ่อจะเกิดขึ้น กฎทุกข้อจะต้องถูก
 * คัดลอกด้วยมือ แล้วสองชุดจะเพี้ยนออกจากกันแบบไม่มีใครรู้จนกว่าจะมีคนเจ็บ
 *
 * ตัวอย่างที่ไม่ใช่การเดา: ถ้าทางที่สองลืมเช็ค `suspendedAt` ออเดอร์ของร้านที่ถูกแบน
 * จะเดินไปถึงสถานะที่ `canPay()` เปิด แล้วขึ้น QR พร้อมเพย์ของคนที่เพิ่งถูกแบน
 * และถ้าลืมแช่ `tosSnapshot` การ์ดข้อตกลงจะหายไปทั้งใบเงียบ ๆ เพราะหน้าจอเช็ค
 * `length > 0` ก่อนวาด — ลูกค้าจะไม่มีทางรู้ว่าตกลงอะไรไว้
 *
 * ไฟล์นี้จึงถือสองอย่าง: **อะไรต้องจริงก่อน** (`assertCanAcceptNewOrder`)
 * และ **อะไรต้องถูกเขียน** (`insertNewOrder`)
 */

/** สถานะร้านที่ยังรับคำขอใหม่ได้ — waitlist รับได้ แต่ลูกค้ารู้ว่าต้องรอ */
const ACCEPTING_STATUSES = new Set(["open", "waitlist"]);

export type NewOrderRefusal = "not_found" | "shop_closed" | "own_shop";

/**
 * ร้านนี้รับออเดอร์ใหม่จากคนนี้ได้ไหม
 *
 * ลำดับการเช็คสำคัญ: เรื่องที่ตอบว่า "ไม่มีอยู่" ต้องมาก่อนเรื่องที่เปิดเผยสถานะร้าน
 * คนที่ไม่ควรเห็นร้านนี้จะได้ไม่รู้ว่ามันมีอยู่จริงแต่ปิดอยู่
 */
export function assertCanAcceptNewOrder(input: {
  page: { isPublished: boolean; suspendedAt: Date | null; status: string };
  owner: { id: string };
  /**
   * ยังไม่รู้ว่าใครจะเป็นลูกค้าก็ปล่อยว่างได้ — ใช้ตอนครีเอเตอร์ออกใบเชิญ
   * ซึ่งยังไม่มีคนกดรับ การเช็ค "ร้านตัวเอง" จะถูกข้ามไปในกรณีนั้น
   * และต้องถูกเช็คอีกครั้งตอนรู้ตัวคนจริง ๆ (ตอนครีเอเตอร์กดยืนยันคำขอ)
   */
  clientUserId?: string;
}): { ok: true } | { ok: false; error: NewOrderRefusal } {
  const { page, owner, clientUserId } = input;

  // สั่งงานร้านตัวเองไม่ได้ — ทำให้สถิติและโควตาเพี้ยนโดยไม่มีประโยชน์อะไร
  if (clientUserId && owner.id === clientUserId) return { ok: false, error: "own_shop" };

  if (!page.isPublished) return { ok: false, error: "not_found" };

  // ร้านถูกผู้ดูแลระงับ = รับงานใหม่ไม่ได้ แต่ออเดอร์เดิมเดินต่อได้ตามปกติ
  // ตอบเหมือน "ร้านปิด" ไม่ใช่บอกว่าโดนระงับ — เรื่องระหว่างเรากับครีเอเตอร์
  if (page.suspendedAt) return { ok: false, error: "shop_closed" };
  if (!ACCEPTING_STATUSES.has(page.status)) return { ok: false, error: "shop_closed" };

  return { ok: true };
}

export type NewOrderAnswer = { key: string; label: string; value: string };

/**
 * เขียนออเดอร์ใหม่ลงฐานข้อมูล — ออเดอร์ รายการราคา คำตอบบรีฟ และ event แรกของ timeline
 *
 * ทุกอย่างอยู่ใน `db.batch()` ครั้งเดียว (neon-http ไม่มี interactive transaction)
 * ถ้าคำสั่งไหนพัง จะไม่มีออเดอร์ครึ่ง ๆ กลาง ๆ ค้างไว้
 */
export async function insertNewOrder(input: {
  page: { id: string; tos: string[] };
  owner: { plan: string | null };
  service: { id: string; deliveryDays: number; revisionsIncluded: number };
  clientUserId: string;
  quote: {
    subtotalCents: number;
    addonsCents: number;
    totalCents: number;
    /**
     * มัดจำที่ต้องจ่ายก่อนเริ่มงาน — 0 = ไม่บังคับ
     *
     * ⚠️ ต้องรับมาที่นี่ ไม่ใช่ปล่อยให้คอลัมน์ default เป็น 0
     * `depositSatisfied()` เป็นจริงเสมอเมื่อค่านี้เป็น 0 ด่านมัดจำใน `transitionOrder`
     * จึงไม่เคยทำงาน — เป็นรูที่เพิ่งอุดไปตอนทำใบเสนอราคา ทางสร้างออเดอร์ทางใหม่
     * ที่ลืมส่งค่านี้จะเปิดรูเดิมขึ้นมาอีกครั้งแบบเงียบ ๆ
     */
    depositCents?: number;
    lines: PriceLine[];
  };
  answers?: NewOrderAnswer[];
  isPublicInQueue: boolean;
  /** ใครเป็นคนทำให้ออเดอร์นี้เกิด — ขึ้นบน timeline เป็น event แรก */
  actorUserId: string;
  eventType?: string;
  /**
   * เวลาที่ลูกค้ายอมรับข้อตกลงจริง ๆ — ไม่ใส่ = ตอนนี้
   *
   * มีไว้เพราะทางสร้างออเดอร์ที่ลูกค้ากดยอมรับคนละจังหวะกับที่ออเดอร์เกิด
   * (ใบเชิญ: ลูกค้ากดรับวันนี้ ครีเอเตอร์ยืนยันอีกสามวัน) ถ้าประทับเวลาตอนเขียนแถว
   * หลักฐานการยินยอมชิ้นเดียวที่แพลตฟอร์มมีจะชี้ไปที่การกดของครีเอเตอร์ ไม่ใช่ของลูกค้า
   */
  acceptedTosAt?: Date;
}): Promise<
  { ok: true; orderId: string; code: string } | { ok: false; error: "creator_full" | "invalid" }
> {
  const db = getDb();
  const { page, service, quote } = input;
  const answers = input.answers ?? [];

  /**
   * โควตางานที่กำลังดำเนินอยู่เป็นของ **ครีเอเตอร์เจ้าของร้าน** ไม่ใช่ของลูกค้า
   * ช่วงเบต้ายกให้ทุกคนเท่า Pro ผ่าน `effectivePlan()`
   *
   * เช็คที่นี่ ไม่ใช่ในด่านข้างบน เพราะมันต้องนับจากฐานข้อมูล — ยิ่งอยู่ใกล้จังหวะ
   * เขียนจริงเท่าไร ช่องว่างระหว่าง "นับ" กับ "เขียน" ก็ยิ่งแคบลง
   *
   * ⚠️ ยังไม่อะตอมมิกอยู่ดี สองคนกดพร้อมกันเกินโควตาไปหนึ่งใบได้ — ยอมรับได้
   * เพราะโทษคือครีเอเตอร์ได้งานเพิ่มหนึ่งงาน ไม่ใช่เงินหรือข้อมูลของใครเสียหาย
   */
  const plan = effectivePlan((input.owner.plan ?? "free") as PlanId);
  const maxActive = PLANS[plan]?.limits.active_orders ?? PLANS.free.limits.active_orders;
  if (Number.isFinite(maxActive)) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.order)
      .where(
        and(
          eq(schema.order.creatorPageId, page.id),
          inArray(schema.order.status, [...ACTIVE_STATUSES]),
        ),
      );
    if (n >= maxActive) return { ok: false, error: "creator_full" };
  }

  const orderId = newId("ord");
  const now = new Date();
  const dueAt = new Date(now.getTime() + service.deliveryDays * 86_400_000);

  const values = {
    id: orderId,
    creatorPageId: page.id,
    clientUserId: input.clientUserId,
    serviceId: service.id,
    status: "requested" as const,
    currency: "THB",
    subtotalCents: quote.subtotalCents,
    addonsCents: quote.addonsCents,
    totalCents: quote.totalCents,
    depositCents: quote.depositCents ?? 0,
    revisionsAllowed: service.revisionsIncluded,
    // แช่ TOS ฉบับที่ลูกค้าเห็นตอนกดยอมรับ — ครีเอเตอร์แก้ทีหลังไม่ย้อนหลังมาที่ออเดอร์นี้
    tosSnapshot: page.tos,
    acceptedTosAt: input.acceptedTosAt ?? now,
    dueAt,
    isPublicInQueue: input.isPublicInQueue,
    createdAt: now,
    updatedAt: now,
  };

  // โอกาส code ชนต่ำมาก (30^8) แต่ไม่ใช่ศูนย์ — ชนแล้วลองใหม่อีกครั้งหนึ่ง
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateOrderCode();

    const insertOrder = db.insert(schema.order).values({ ...values, code });
    const insertItems = db.insert(schema.orderItem).values(
      quote.lines.map((line, i) => ({
        id: newId("oitm"),
        orderId,
        /**
         * บรรทัดตัวคูณต้องแช่อัตราไว้ในข้อความด้วย
         *
         * `label` คือ "ข้อความที่ลูกค้าเห็นตอนสั่ง" ซึ่งบนหน้าจอคือ "ใช้เชิงพาณิชย์ (×2)"
         * ถ้าเก็บแค่ชื่อกับจำนวนเงิน ใบเสร็จจะอธิบายไม่ได้ว่าเงินก้อนนี้มาจากไหน
         * และย้อนกลับไปดูจากเมนูปัจจุบันก็ไม่ได้ เพราะครีเอเตอร์แก้อัตราทีหลังได้
         */
        label: line.multiplierBp ? `${line.label} (×${line.multiplierBp / 10_000})` : line.label,
        kind: line.kind,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
        sourceId: line.sourceId,
        sortOrder: i,
      })),
    );
    const insertEvent = db.insert(schema.message).values({
      id: newId("msg"),
      orderId,
      senderUserId: input.actorUserId,
      isSystemEvent: true,
      eventType: input.eventType ?? "order_created",
      createdAt: now,
    });

    try {
      // แยกสองทางเพราะ batch() รับเป็น tuple — ใส่ array ที่ยาวไม่แน่นอนแล้ว type ไม่ผ่าน
      // และ .values([]) กับ array ว่างจะ generate SQL ที่พัง
      if (answers.length > 0) {
        const insertAnswers = db.insert(schema.orderAnswer).values(
          answers.map((a, i) => ({
            id: newId("oans"),
            orderId,
            fieldKey: a.key,
            fieldLabel: a.label,
            value: a.value,
            sortOrder: i,
          })),
        );
        await db.batch([insertOrder, insertItems, insertAnswers, insertEvent]);
      } else {
        await db.batch([insertOrder, insertItems, insertEvent]);
      }
      return { ok: true, orderId, code };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (attempt === 0 && msg.includes("order_code_unique")) continue;
      throw err;
    }
  }

  return { ok: false, error: "invalid" };
}
