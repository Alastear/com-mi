import type { OrderStatus } from "@/lib/types";

/**
 * State machine ของออเดอร์ — docs/02-data-model.md §5
 *
 * ทุกการเปลี่ยนสถานะต้องผ่าน `assertTransition()` ที่เดียว ห้ามมี
 * `db.update(order).set({ status })` ลอย ๆ ที่ไหนอีก เพราะสถานะเป็นตัวคุมทั้ง
 * สิทธิ์การดาวน์โหลดไฟล์ การนับโควตา และเงินที่ค้างจ่าย — ถ้าเซ็ตข้ามขั้นได้
 * ลูกค้าจะกดจาก requested ไป delivered แล้วโหลดไฟล์ไปโดยไม่จ่ายเงิน
 *
 * `by` คือ **ใครมีสิทธิ์กด** ไม่ใช่ใครได้ประโยชน์
 *   creator — เจ้าของร้าน
 *   client  — ลูกค้าที่สั่งงาน
 *   system  — cron / งานอัตโนมัติ (เช่น ปิดออเดอร์เองเมื่อครบ 7 วัน)
 */

export type Actor = "creator" | "client" | "system";

type Transition = {
  to: OrderStatus;
  by: readonly Actor[];
  /**
   * เส้นทางนี้มีอยู่จริง แต่ **แถบปุ่มธรรมดาต้องไม่แสดง** — ต้องเดินผ่าน action ที่ระบุ
   *
   * มีไว้เพราะบางการเปลี่ยนสถานะต้องเขียนอย่างอื่นพร้อมกันในทรานแซกชันเดียว
   * แล้วปุ่มธรรมดาเขียนแค่ `status` อย่างเดียว (ดู `transitionOrder`)
   * กดปุ่มธรรมดาจึงได้สถานะที่โกหก: บอกว่าเกิดขึ้นแล้วทั้งที่ของจริงยังไม่เกิด
   *
   * เคยเสียเวลากับรูปแบบนี้มาสามครั้ง (ส่งใบเสนอราคาโดยไม่มีใบ, ยอมรับใบโดยไม่พกราคา,
   * และส่งมอบงานโดยไม่ปล่อยไฟล์) จึงทำให้เป็นข้อมูลบนตารางแทนที่จะไปกรองที่หน้าจอ —
   * กรองที่หน้าจอคือมีความจริงสองที่ แล้วมันจะเพี้ยนออกจากกันในที่สุด
   */
  viaAction?: string;
  /**
   * เส้นนี้มีได้เฉพาะเมื่อลูกค้า **ได้ไฟล์ไปแล้วอย่างน้อยหนึ่งรอบ** (มีแถว `delivery` ที่ปล่อยแล้ว)
   *
   * ข้อเท็จจริงนี้ตารางไม่รู้ (ขึ้นกับข้อมูลของออเดอร์ใบนั้น) — `allowedNext` ซ่อนเส้นนี้จนกว่าผู้เรียก
   * จะบอกว่า `released` และด่านจริงอยู่ใน WHERE ของ `transitionOrder` (ดู `needsRelease`)
   */
  afterRelease?: true;
};

/**
 * ลูกค้าปิดงานด้วยไฟล์ที่ได้ไปแล้ว — จากทุกสถานะที่งานกลับมาทำต่อหลังส่งมอบ
 *
 * ⚠️ ต้องมี ไม่งั้นครีเอเตอร์ขังออเดอร์ไว้ได้ด้วยคลิกเดียว: งานส่งแล้ว ลูกค้าจ่ายครบ ครีเอเตอร์กด
 * "เปิดรอบแก้" (ไม่กินสิทธิ์ลูกค้า) แล้วไม่ส่งอีกเลย — จาก revision_requested ลูกค้าไปได้แค่ยกเลิก
 * (ครีเอเตอร์ยังกดไป in_progress / in_review ต่อได้อีก ซึ่งลูกค้าก็ไปได้แค่ยกเลิกเหมือนกัน)
 * cron ปิดงานเองดูแค่ `delivered` ลูกค้าจึงไม่มีทางถึง `completed` = รีวิวไม่ได้ตลอดกาล
 * และการยกเลิกของลูกค้าไม่นับเป็น "ร้านยกเลิก" ในประวัติร้าน — ร้านเลี่ยงรีวิวแย่ได้ทุกออเดอร์
 * ลูกค้าที่ขอแก้เองแล้วร้านเงียบไปก็ติดแบบเดียวกัน เส้นนี้จึงไม่ดูว่าใครเปิดรอบแก้
 *
 * ไฟล์ที่ปล่อยแล้วโหลดได้ต่อตลอด (`requestDeliveryDownload` ไม่ดูสถานะ) — ปิดงานไม่ทำให้ลูกค้าเสียอะไร
 * ⚠️ `afterRelease` คือหัวใจ: ก่อนเคยได้ไฟล์ (ช่วง WIP ก่อนส่งจริง) ห้ามปิดงาน — จะได้งาน
 * "เสร็จ" ที่ไม่มีไฟล์ส่งมอบสักไฟล์ และยังค้างเงินอยู่ได้
 */
const CLIENT_CLOSES_AFTER_RELEASE: Transition = { to: "completed", by: ["client"], afterRelease: true };

/**
 * ⚠️ **ไม่มีเส้นไหนเข้าสู่ `quoted` เลย และห้ามเพิ่ม**
 *
 * `quoted` แปลว่า "มีใบเสนอราคาที่กดยอมรับได้อยู่จริง" ไม่ใช่แค่ป้ายสถานะ
 * `issueQuote()` เป็นตัวเดียวที่เขียนสถานะนี้ และมันเขียนพร้อมแถวใบในทรานแซกชันเดียว
 *
 * ตอนที่เคยมีเส้น `requested → quoted` อยู่ในนี้ แถบปุ่มสร้างปุ่ม "ส่งใบเสนอราคา"
 * ขึ้นมาอีกปุ่มโดยอัตโนมัติ (ทุกปุ่มมาจาก `allowedNext()`) กดแล้วออเดอร์กลายเป็น
 * `quoted` โดยไม่มีใบสักใบ — ลูกค้าเปิดมาเจอ "รอครีเอเตอร์ตอบรับ" ทั้งที่สถานะบอกว่า
 * เสนอราคาไปแล้ว ทั้งคู่จึงนั่งรออีกฝ่ายอยู่คนละหน้าจอ
 */
const TRANSITIONS: Record<OrderStatus, readonly Transition[]> = {
  requested: [
    { to: "reviewing", by: ["creator"] },
    // instant mode ข้ามการเสนอราคาไปเลย — ราคาตายตัวอยู่แล้ว
    { to: "accepted", by: ["creator"] },
    { to: "declined", by: ["creator"] },
    { to: "cancelled", by: ["client"] },
    { to: "expired", by: ["system"] },
  ],
  reviewing: [
    { to: "accepted", by: ["creator"] },
    { to: "declined", by: ["creator"] },
    { to: "cancelled", by: ["client"] },
  ],
  quoted: [
    /**
     * ⚠️ **ไม่มีเส้น `quoted → accepted` ที่นี่โดยตั้งใจ** — ต้องผ่าน `acceptQuote()` เท่านั้น
     *
     * ปุ่มบนหน้าจอทุกปุ่มมาจาก `allowedNext()` ตัวนี้ ตอนที่ยังมีเส้นนี้อยู่
     * ลูกค้าที่เปิดหน้ามาเจอใบเสนอราคาจะเห็นปุ่มยอมรับ **สองปุ่ม**: ปุ่มบนการ์ด
     * ที่พกราคาไปด้วย กับปุ่มธรรมดาในแถบสถานะที่ไม่พกอะไรเลย
     *
     * กดปุ่มธรรมดา = ออเดอร์เป็น `accepted` ที่ **ราคาเดิมก่อนเสนอ** ใบเสนอราคาถูกทิ้ง
     * และย้อนไม่ได้เลย เพราะ `issueQuote()` ออกใบได้เฉพาะก่อนตอบรับ —
     * ราคาที่ตกลงกันจึงหายไปถาวรจากการกดผิดปุ่มครั้งเดียว
     *
     * เอกสาร docs/06-quotes-and-invites.md เตือนเรื่องนี้ไว้ตั้งแต่ตอนออกแบบว่า
     * "ปุ่มเปลี่ยนสถานะธรรมดาไม่พกราคาไปด้วย" แต่ตอนสร้างจริงลืมปิดทางเก่า
     */
    { to: "declined", by: ["creator"] },
    { to: "cancelled", by: ["client"] },
    { to: "expired", by: ["system"] },
    /**
     * ถอนใบเสนอราคากลับมาคิดใหม่ — ต้องผ่าน `withdrawQuote()` เพราะการถอน
     * ต้องปิดแถวใบพร้อมกับเปลี่ยนสถานะ ปุ่มธรรมดาจะเปลี่ยนแค่สถานะ
     * แล้วเหลือใบที่ยังเปิดอยู่บนออเดอร์ที่ไม่ใช่ `quoted` — ลูกค้าจะกดยอมรับไม่ได้
     * และครีเอเตอร์จะออกใบใหม่ไม่ได้เพราะ index บังคับว่ามีใบเปิดได้ใบเดียว
     */
    { to: "reviewing", by: ["creator"], viaAction: "withdrawQuote" },
  ],
  accepted: [
    { to: "in_progress", by: ["creator"] },
    { to: "cancelled", by: ["creator", "client"] },
  ],
  in_progress: [
    { to: "in_review", by: ["creator"] },
    // ส่งไฟล์จริงเลยโดยไม่ผ่านรอบ WIP ก็ได้ — งานเล็ก ๆ ไม่จำเป็นต้องมี
    { to: "delivered", by: ["creator"], viaAction: "deliverAndRelease" },
    { to: "cancelled", by: ["creator", "client"] },
    CLIENT_CLOSES_AFTER_RELEASE,
  ],
  in_review: [
    // ขอแก้ตอนดูงานระหว่างทำ **นับโควตารอบแก้** เหมือนหลังส่งไฟล์จริง — เหตุผลอยู่ที่ `consumesRevision()`
    // (โควตาไม่ได้อยู่ในตารางนี้ เพราะขึ้นกับตัวเลขของออเดอร์ใบนั้น ด่านอยู่ใน `transitionOrder`)
    { to: "revision_requested", by: ["client"] },
    /**
     * ครีเอเตอร์ถอยกลับไปทำต่อเองได้ — **ไม่กินโควตาของลูกค้า** (`consumesRevision` นับแค่ลูกค้าขอแก้)
     *
     * ⚠️ ต้องมี ไม่งั้น in_review เป็นทางเดียว: ลูกค้าใช้สิทธิ์แก้ครบแล้ว (ปุ่มขอแก้หายไป)
     * แต่ยังทักในแชทว่าอยากปรับนิดหน่อย ครีเอเตอร์ยอมแก้ให้ — ทางออกจาก in_review ที่เหลือคือ
     * ส่งไฟล์จริง (ต้องจ่ายครบก่อน) หรือยกเลิกงาน สถานะจึงค้างว่า "รอลูกค้าตรวจ" ทั้งที่ครีเอเตอร์
     * กำลังแก้อยู่ และถ้ายังไม่จ่ายครบก็ไม่มีปุ่มไหนพาไปต่อได้เลย
     * ครีเอเตอร์เลือกทำงานเพิ่มเองไม่ใช่การใช้สิทธิ์ของลูกค้า โควตามีไว้คุ้มครองครีเอเตอร์อยู่แล้ว
     */
    { to: "in_progress", by: ["creator"] },
    { to: "delivered", by: ["creator"], viaAction: "deliverAndRelease" },
    { to: "cancelled", by: ["creator", "client"] },
    CLIENT_CLOSES_AFTER_RELEASE,
  ],
  revision_requested: [
    { to: "in_progress", by: ["creator"] },
    { to: "cancelled", by: ["creator", "client"] },
    CLIENT_CLOSES_AFTER_RELEASE,
  ],
  delivered: [
    { to: "completed", by: ["client", "system"] },
    // ลูกค้าทักว่าไฟล์ผิด/ไม่ครบ ยังขอแก้ได้ถ้าโควตารอบแก้ยังเหลือ (ด่านอยู่ใน `transitionOrder`)
    { to: "revision_requested", by: ["client"] },
    /**
     * ครีเอเตอร์เปิดรอบแก้เองได้ — **ไม่กินโควตาของลูกค้า** (`consumesRevision` ดูผู้กด)
     *
     * ⚠️ ต้องมี ไม่งั้นเกิดทางตัน: ลูกค้าใช้สิทธิ์ครบตั้งแต่ช่วงสเก็ตช์ แล้วครีเอเตอร์ส่งไฟล์ผิด
     * หรือไม่ครบ ลูกค้าจ่ายครบแล้ว (เข้า delivered ได้ต้องจ่ายครบ) แต่ขอแก้ไม่ได้เพราะสิทธิ์หมด
     * และครีเอเตอร์ก็ถอยจาก delivered ไม่ได้ — ไฟล์ผิดค้างอยู่ตลอดกาล
     * ความผิดพลาดของครีเอเตอร์ต้องแก้ได้โดยครีเอเตอร์ ไม่ใช่เอาสิทธิ์ลูกค้ามาจ่าย
     */
    { to: "revision_requested", by: ["creator"] },
  ],
  completed: [],
  declined: [],
  cancelled: [],
  expired: [],
};

/**
 * การปิดงานครั้งนี้เป็นเส้น "ลูกค้าปิดงานด้วยไฟล์ที่ได้ไปแล้ว" (`CLIENT_CLOSES_AFTER_RELEASE`) หรือไม่
 * — คือปิดระหว่างที่งานกลับมาทำต่อหลังส่งมอบ ไม่ใช่กดรับงานที่เพิ่งส่งมอบ (`delivered`)
 *
 * รับ string ดิบเพราะอ่านจากข้อมูลที่เก็บไว้แล้ว (แจ้งเตือน/event) — ค่าที่ไม่รู้จัก = false ไม่ throw
 * ⚠️ ใช้ตัดสินข้อความ/อีเมลถึงครีเอเตอร์ ไม่ใช่สิทธิ์ — สิทธิ์อยู่ที่ `assertTransition` + `needsRelease`
 */
export function closedEarly(from: string, to: string): boolean {
  if (to !== "completed" || !Object.hasOwn(TRANSITIONS, from)) return false;
  return TRANSITIONS[from as OrderStatus].includes(CLIENT_CLOSES_AFTER_RELEASE);
}

/** สถานะปลายทาง — ไปต่อไม่ได้แล้ว */
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * สถานะที่ไปต่อได้จากตรงนี้ สำหรับ actor คนนี้ — ใช้ตัดสินว่าจะโชว์ปุ่มอะไรบ้าง
 *
 * ตัดเส้นที่มี `viaAction` ออก เพราะปุ่มพวกนั้นต้องมาจากหน้าจอเฉพาะของมัน
 * เส้น `afterRelease` โผล่เฉพาะเมื่อผู้เรียกบอกว่ามีรอบที่ปล่อยแล้ว — ไม่บอก = ถือว่ายังไม่มี
 * (ปุ่มที่หายไปผิด ๆ ดีกว่าปุ่มที่กดแล้ว server ปฏิเสธ)
 */
export function allowedNext(
  from: OrderStatus,
  actor: Actor,
  facts: { released?: boolean } = {},
): OrderStatus[] {
  return TRANSITIONS[from]
    .filter((t) => t.by.includes(actor) && !t.viaAction && (!t.afterRelease || facts.released === true))
    .map((t) => t.to);
}

/**
 * หาเส้นทางที่ตรงทั้งปลายทางและคนกด
 *
 * ⚠️ ห้ามหาจาก `to` อย่างเดียว — ปลายทางเดียวกันมีได้หลายเส้นที่ต่างกันแค่คนกด
 * (delivered → revision_requested มีเส้นของลูกค้ากับเส้นของครีเอเตอร์แยกกัน)
 * ถ้าหยิบเส้นแรกที่เจอ เส้นของลูกค้าที่อยู่ก่อนจะบังเส้นของครีเอเตอร์ตลอด
 * ปุ่ม "เปิดรอบแก้" ของครีเอเตอร์ (ซึ่ง `allowedNext` โชว์ให้) จึงตก wrong_actor ทุกครั้ง
 */
function routeFor(from: OrderStatus, to: OrderStatus, actor: Actor): Transition | undefined {
  return TRANSITIONS[from].find((t) => t.to === to && t.by.includes(actor));
}

/** เส้นทางนี้ (ของคนกดคนนี้) ต้องเดินผ่าน action เฉพาะไหม — คืนชื่อ action ถ้าใช่ */
export function requiresAction(from: OrderStatus, to: OrderStatus, actor: Actor): string | null {
  return routeFor(from, to, actor)?.viaAction ?? null;
}

/** เส้นทางนี้ (ของคนกดคนนี้) ต้องมีรอบที่ปล่อยแล้วก่อนไหม — ด่านจริงอยู่ใน WHERE ของ `transitionOrder` */
export function needsRelease(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return routeFor(from, to, actor)?.afterRelease === true;
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return routeFor(from, to, actor) !== undefined;
}

export class TransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly actor: Actor,
    readonly reason: "not_allowed" | "wrong_actor",
  ) {
    super(`transition ${from} → ${to} by ${actor}: ${reason}`);
    this.name = "TransitionError";
  }
}

/**
 * โยน error ถ้าเปลี่ยนสถานะแบบนี้ไม่ได้
 *
 * แยก `wrong_actor` ออกจาก `not_allowed` เพราะสองอย่างนี้ต้องจัดการต่างกัน:
 * เส้นทางที่ไม่มีอยู่จริงแปลว่าโค้ดฝั่งเราผิด ส่วนผิดคนแปลว่ามีคนพยายามกดของคนอื่น
 * ซึ่งควรถูกบันทึกไว้ดูย้อนหลังได้
 */
export function assertTransition(from: OrderStatus, to: OrderStatus, actor: Actor): void {
  if (routeFor(from, to, actor)) return;
  // มีเส้นไปปลายทางนี้แต่ไม่ใช่ของคนนี้ = ผิดคน / ไม่มีเส้นเลย = ไม่มีทางไปจริง ๆ
  const exists = TRANSITIONS[from].some((t) => t.to === to);
  throw new TransitionError(from, to, actor, exists ? "wrong_actor" : "not_allowed");
}
