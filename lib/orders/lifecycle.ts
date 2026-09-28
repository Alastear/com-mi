import type { OrderStatus } from "@/lib/types";
import { canRelease } from "./release";

/**
 * วงจรชีวิตอัตโนมัติของออเดอร์ — กติกาล้วน ๆ ไม่แตะ DB ไม่แตะ Next
 *
 * state machine มีเส้นของ `system` มาตั้งแต่แรก (requested/quoted → expired,
 * delivered → completed) แต่ไม่เคยมีอะไรยิงมันเลย ออเดอร์จึงค้างได้ตลอดกาล:
 * คำขอที่ครีเอเตอร์ไม่เคยเปิดดูนับเป็นงาน active กินโควตาของร้าน และงานที่ส่งแล้ว
 * แต่ลูกค้าไม่กดรับก็ไม่มีวันจบ ตัวที่ยิงจริงอยู่ที่ lib/orders/lifecycle-run.ts (cron รายวัน)
 *
 * ⚠️ ไฟล์นี้คือกติกา ส่วน SQL ใน lifecycle-run.ts เป็นแค่ตัวกรองรอบแรก + compare-and-set
 * ถ้าแก้เงื่อนไขที่นี่ ต้องไปดูตัวกรองใน SQL ด้วย (ตัวกรองต้องหลวมกว่าหรือเท่ากับกติกานี้เสมอ
 * ไม่งั้นออเดอร์ที่ถึงเวลาแล้วจะไม่มีวันถูกหยิบมาตัดสิน)
 */

export const DAY_MS = 86_400_000;

/**
 * คำขอที่ครีเอเตอร์ไม่แตะเลย 14 วัน → หมดอายุ
 *
 * สองสัปดาห์ยาวพอสำหรับครีเอเตอร์ที่ปิดรับชั่วคราว/ไปเที่ยว และสั้นพอที่ลูกค้าจะไม่ยืนรอ
 * คนที่ไม่ตอบจนหมดหวัง — ลูกค้ายังไม่ได้จ่ายอะไร (จ่ายได้หลังตอบรับเท่านั้น) หมดอายุจึงไม่มีเงินค้าง
 * "แตะ" = เปลี่ยนสถานะ หรือพิมพ์ในเธรด ข้อความของลูกค้าไม่นับ — ไม่งั้นลูกค้าที่ทักถามซ้ำ
 * จะยื้อคำขอที่ครีเอเตอร์ไม่สนใจไว้ได้ตลอดกาล
 */
export const REQUEST_TTL_MS = 14 * DAY_MS;

/**
 * ใบเสนอราคาหมดอายุแล้ว รออีก 3 วันก่อนปิดออเดอร์
 *
 * ใบที่หมดอายุกดยอมรับไม่ได้อยู่แล้ว แต่ไม่ปิดทันที — ให้ครีเอเตอร์มีเวลาออกใบใหม่
 * และลูกค้ามีเวลาทักขอราคาต่อ ข้อความของ **ทั้งสองฝ่าย** นับเป็นการคุยต่อ
 * ใบที่ไม่มีวันหมดอายุ (ครีเอเตอร์เลือกเอง) ไม่เข้ากติกานี้เลย
 */
export const QUOTE_GRACE_MS = 3 * DAY_MS;

/**
 * ส่งงานแล้ว 7 วันโดยลูกค้าไม่ทำอะไร → ปิดงานให้อัตโนมัติ
 *
 * ครีเอเตอร์ได้เงินครบแล้วก่อนถึง delivered (ด่าน `canRelease`) การปิดจึงไม่ได้ปลดเงินอะไร
 * แค่ทำให้งานไม่ค้างว่า "รอลูกค้าตรวจ" ตลอดไป — 7 วันพอให้ลูกค้าเปิดไฟล์ตรวจแม้ไม่ได้เข้าเว็บทุกวัน
 */
export const AUTO_COMPLETE_MS = 7 * DAY_MS;

/** วันที่ 5 แจ้งลูกค้าก่อน — เหลือ 2 วันให้กดขอแก้ไขหรือทักครีเอเตอร์ */
export const AUTO_COMPLETE_WARN_MS = 5 * DAY_MS;

/**
 * ต้องเตือนล่วงหน้าอย่างน้อยเท่านี้ก่อนปิดจริง — ตัวเลขเดียวกับที่บอกลูกค้าในแจ้งเตือน
 *
 * ⚠️ ไม่ได้ปิดตาม "วันที่ 7" อย่างเดียว: ถ้า cron ล่มไปหลายวัน หรือยอดเงินเพิ่งกลับมาครบ
 * ในวันที่ 8 การนับจากวันส่งงานอย่างเดียวจะปิดงานทันทีโดยที่ลูกค้าไม่เคยได้รับคำเตือน
 */
export const AUTO_COMPLETE_NOTICE_MS = AUTO_COMPLETE_MS - AUTO_COMPLETE_WARN_MS;

/** จำนวนวันที่บอกลูกค้า — มาจากค่าข้างบน ห้ามพิมพ์ "2" ลงในข้อความเอง */
export const AUTO_COMPLETE_NOTICE_DAYS = Math.round(AUTO_COMPLETE_NOTICE_MS / DAY_MS);

/**
 * เผื่อเวลาที่ cron ตื่นไม่ตรงนาที — Vercel Cron ยิงคลาดได้หลายนาที
 *
 * เตือนตอน 19:00:05 แล้วสองวันต่อมา cron ตื่น 19:00:01 ถ้าเทียบเป๊ะ ๆ จะยังไม่ครบ 2 วัน
 * งานจะเลื่อนไปปิดวันถัดไปทั้งที่บอกลูกค้าว่า 2 วัน ใช้กับด่านที่ cron เขียนเวลาเองเท่านั้น
 */
export const CRON_JITTER_MS = 60 * 60 * 1000;

/**
 * หยิบกี่ใบต่อกติกาต่อรอบ — cron รายวันบน Hobby มีเวลาจำกัด ทุกใบคือหนึ่ง round-trip ไป Neon
 * ใบที่เหลือรอรอบพรุ่งนี้ได้ (เรียงจากเก่าสุดก่อน ไม่มีใบไหนถูกข้ามตลอดไป)
 */
export const LIFECYCLE_LIMIT = 50;

/* ── ข้อมูลที่กติกาต้องใช้ ─────────────────────────────────────────── */

export type LifecycleOrder = {
  status: OrderStatus;
  /**
   * เขียนเฉพาะตอนสถานะหรือยอดเงินเปลี่ยน (ไล่ดูแล้วทุกที่ที่ `.set({ updatedAt })` ของ order)
   * บนออเดอร์ที่ค้างอยู่สถานะเดิม ค่านี้จึงคือ "ครั้งล่าสุดที่มีอะไรเกิดขึ้นกับงานนี้จริง ๆ"
   */
  updatedAt: Date;
  /** ข้อความที่คนพิมพ์ในเธรดล่าสุด (ไม่นับ event ระบบ) แยกตามฝั่ง */
  lastCreatorMessageAt: Date | null;
  lastClientMessageAt: Date | null;
  /** วันหมดอายุของใบเสนอราคาที่ยังเปิดอยู่ — null = ไม่มีใบเปิด หรือใบไม่มีวันหมดอายุ */
  liveQuoteExpiresAt: Date | null;
  totalCents: number;
  amountPaidCents: number;
  /** มีรายการแจ้งโอนที่ครีเอเตอร์ยังไม่ตอบ */
  hasPendingPayment: boolean;
  autoCompleteWarnedAt: Date | null;
};

export type LifecycleDecision =
  | { kind: "none" }
  | { kind: "expire"; from: "requested" | "quoted" }
  | { kind: "warn_auto_complete" }
  | { kind: "auto_complete" };

const NONE: LifecycleDecision = { kind: "none" };

/** เวลาล่าสุดในชุด — null ทิ้งไป (เหมือน `greatest()` ของ Postgres ที่ SQL ฝั่ง cron ใช้) */
function latest(...dates: Array<Date | null>): Date {
  let best = -Infinity;
  for (const d of dates) if (d && d.getTime() > best) best = d.getTime();
  return new Date(best);
}

/** นาฬิกาของคำขอเริ่มนับจากไหน — ครีเอเตอร์ทำอะไรล่าสุดเมื่อไร */
export function requestAnchor(o: LifecycleOrder): Date {
  return latest(o.updatedAt, o.lastCreatorMessageAt);
}

/** นาฬิกาของใบเสนอราคาที่หมดอายุ — ใบหมดอายุ หรือมีใครพูดอะไรหลังจากนั้น */
export function quoteAnchor(o: LifecycleOrder): Date | null {
  if (!o.liveQuoteExpiresAt) return null;
  return latest(o.liveQuoteExpiresAt, o.updatedAt, o.lastCreatorMessageAt, o.lastClientMessageAt);
}

/**
 * นาฬิกาของงานที่ส่งแล้ว — ส่งงาน (หรือเงินขยับครั้งล่าสุด) หรือลูกค้าทักมาล่าสุด
 *
 * ข้อความของลูกค้านับเป็น "ยังไม่จบ" เสมอ: ลูกค้าที่สิทธิ์แก้หมดแล้วแต่เจอไฟล์ผิด กดขอแก้ไม่ได้
 * ช่องทางเดียวคือทักครีเอเตอร์ (ซึ่งเปิดรอบแก้ให้ได้โดยไม่กินสิทธิ์) ถ้าไม่นับข้อความ
 * ระบบจะปิดงานทับเรื่องที่กำลังคุยกันอยู่
 * ข้อความของครีเอเตอร์ไม่นับ — "ได้รับไฟล์ไหมครับ" ไม่ควรยื้องานของตัวเองออกไป
 */
export function deliveredAnchor(o: LifecycleOrder): Date {
  return latest(o.updatedAt, o.lastClientMessageAt);
}

/**
 * ปิดงานอัตโนมัติได้ไหมในแง่เงิน — ต้องจ่ายครบ (`canRelease` ตัวเดียวกับด่านส่งมอบ)
 * และไม่มีรายการแจ้งโอนค้าง ไม่ผ่าน = ไม่เตือนด้วย เพราะคำเตือนจะกลายเป็นคำโกหก
 */
export function autoCompleteBlocked(o: LifecycleOrder): boolean {
  return !canRelease(o) || o.hasPendingPayment;
}

/**
 * ตัดสินว่าวันนี้ต้องทำอะไรกับออเดอร์นี้ — ทำได้อย่างมากหนึ่งอย่างต่อรอบ
 *
 * เตือนกับปิดไม่เกิดในรอบเดียวกันเด็ดขาด: ปิดได้ต้องเคยเตือนในรอบนับนี้มาแล้วอย่างน้อย
 * `AUTO_COMPLETE_NOTICE_MS` ถ้าวันนี้เพิ่งเตือน ก็ต้องรอรอบถัด ๆ ไป
 */
export function decideLifecycle(o: LifecycleOrder, now: Date): LifecycleDecision {
  const t = now.getTime();

  if (o.status === "requested") {
    return t - requestAnchor(o).getTime() >= REQUEST_TTL_MS
      ? { kind: "expire", from: "requested" }
      : NONE;
  }

  if (o.status === "quoted") {
    const anchor = quoteAnchor(o);
    // ใบยังไม่หมดอายุ หรือไม่มีวันหมดอายุ = ยังไม่เข้ากติกา
    if (!anchor || !o.liveQuoteExpiresAt || o.liveQuoteExpiresAt.getTime() > t) return NONE;
    return t - anchor.getTime() >= QUOTE_GRACE_MS ? { kind: "expire", from: "quoted" } : NONE;
  }

  if (o.status === "delivered") {
    if (autoCompleteBlocked(o)) return NONE;
    const anchor = deliveredAnchor(o).getTime();
    const warned = o.autoCompleteWarnedAt?.getTime() ?? null;
    // เตือนก่อนจุดเริ่มนับรอบนี้ = เตือนของรอบเก่า (ก่อนลูกค้าทักมา / ก่อนส่งงานรอบใหม่) ใช้ไม่ได้
    const warnedThisRound = warned !== null && warned >= anchor;

    if (!warnedThisRound) {
      return t - anchor >= AUTO_COMPLETE_WARN_MS ? { kind: "warn_auto_complete" } : NONE;
    }
    const aged = t - anchor >= AUTO_COMPLETE_MS;
    const noticed = t - warned >= AUTO_COMPLETE_NOTICE_MS - CRON_JITTER_MS;
    return aged && noticed ? { kind: "auto_complete" } : NONE;
  }

  return NONE;
}

/* ── มัดจำครบ = เริ่มนับกำหนดส่ง ─────────────────────────────────── */

/**
 * ยอดเพิ่งข้ามเส้นมัดจำในการคิดยอดครั้งนี้ และยังไม่เคยข้ามมาก่อน
 *
 * ⚠️ ต้องตรงกับ `justMet` ใน `recomputePaid` (lib/payments/actions.ts) ทุกเงื่อนไข
 *
 * ดูที่ "ข้ามเส้น" (เดิมต่ำกว่า ตอนนี้ถึง) ไม่ใช่แค่ "ถึงแล้ว" — ออเดอร์ที่มัดจำครบไปก่อนมีระบบนี้
 * (`depositMetAt` เป็น null) ห้ามถูกเลื่อนกำหนดส่งตอนลูกค้าโอนงวดสุดท้าย
 * ออเดอร์ไม่มีมัดจำ (0) ไม่เคยข้ามเส้น — นาฬิกาของมันเริ่มตอนตอบรับงาน (`clockStartsOnAccept`)
 */
export function depositJustMet(o: {
  depositCents: number;
  depositMetAt: Date | null;
  oldPaidCents: number;
  newPaidCents: number;
}): boolean {
  return (
    o.depositMetAt === null &&
    o.depositCents > 0 &&
    o.oldPaidCents < o.depositCents &&
    o.newPaidCents >= o.depositCents
  );
}

/**
 * กำหนดส่งใหม่เมื่อมัดจำครบ = ตอนนี้ + ระยะเวลาทำงานที่ตกลงไว้
 *
 * ระยะเวลาเอาจากตัวออเดอร์ (`dueAt − createdAt`) ไม่ใช่ `service.deliveryDays` ปัจจุบัน:
 * `insertNewOrder()` ตั้ง dueAt = createdAt + deliveryDays ในคำสั่งเดียว ค่านี้จึงเป็น
 * snapshot ของจำนวนวันที่ลูกค้าเห็นตอนสั่ง ส่วนเมนูครีเอเตอร์แก้ได้ตลอด (และออเดอร์จากใบเชิญ
 * ใช้จำนวนวันของฉบับที่ลูกค้ากดรับ ไม่ใช่ของเมนู) — ออเดอร์คือหลักฐาน ไม่ใช่ view ของเมนู
 */
export function dueAfterDeposit(
  o: { dueAt: Date | null; createdAt: Date },
  metAt: Date,
): Date | null {
  if (!o.dueAt) return null;
  return new Date(metAt.getTime() + (o.dueAt.getTime() - o.createdAt.getTime()));
}

/* ── ไม่มีมัดจำ = ตอบรับงานแล้วเริ่มนับกำหนดส่ง ─────────────────────── */

/**
 * การเขียนที่ทำให้ออเดอร์เป็น `accepted` ครั้งนี้ต้องเริ่มนาฬิกากำหนดส่งไหม
 *
 * `dueAt` ถูกตั้งตั้งแต่ลูกค้ากดสั่ง (`insertNewOrder`) แต่ก่อนตอบรับ ครีเอเตอร์ยังไม่ได้รับงาน
 * — คำขอที่รอคุยราคา 5 วัน หรือใบเสนอราคาที่ลูกค้านั่งดูอยู่ 5 วัน กินเวลาทำงาน 7 วันไปแล้ว 5 วัน
 * ออเดอร์มีมัดจำแก้เรื่องนี้ไว้แล้วด้วย "มัดจำครบ = เริ่มนับ" (`depositJustMet`) ออเดอร์ไม่มีมัดจำ
 * ใช้ตัวคั่นเดียวกันคือ `depositMetAt` — ความหมายคือ "เริ่มนับกำหนดส่งเมื่อไร" ไม่ต้องมีคอลัมน์ใหม่
 *
 * ⚠️ ต้องตรงกับ `startClockOnAcceptSet()` ใน lib/orders/due-clock-sql.ts ทุกเงื่อนไข
 *   - `depositCents` คือมัดจำ **หลัง** การเขียนครั้งนี้ — ยอมรับใบเสนอราคาเปลี่ยนมัดจำใน UPDATE เดียวกัน
 *   - `depositMetAt === null` คือด่าน "ครั้งเดียว": ตั้งแล้วไม่มีอะไรเลื่อนซ้ำ
 *   - ออเดอร์มีมัดจำ = false เสมอ ปล่อยให้ `recomputePaid` เลื่อนตอนมัดจำครบตามเดิม
 */
export function clockStartsOnAccept(o: { depositCents: number; depositMetAt: Date | null }): boolean {
  return o.depositMetAt === null && o.depositCents <= 0;
}

/**
 * เวลาเริ่มนับ = ตอนตอบรับ แต่ไม่ก่อนตอนสร้างออเดอร์
 *
 * ⚠️ ใบเชิญสร้างออเดอร์แล้วตอบรับในคำสั่งถัดไปด้วย `now` ที่จับไว้ **ก่อน** สร้าง — ช้ากว่ากันไม่กี่ ms
 * ถ้าไม่กันไว้ `depositMetAt` จะมาก่อน `createdAt` แล้วกำหนดส่งหดลงเล็กน้อยแบบไม่มีเหตุผล
 */
export function clockStartAt(o: { createdAt: Date }, acceptedAt: Date): Date {
  return acceptedAt.getTime() > o.createdAt.getTime() ? acceptedAt : o.createdAt;
}

/* ── เลยกำหนด (คำนวณตอนแสดง ไม่เก็บ) ─────────────────────────────── */

/**
 * สถานะที่ยังนับกำหนดส่ง — งานยังอยู่ในมือครีเอเตอร์หรือรอคุยกันอยู่
 *
 * delivered/completed ไม่นับ: ส่งงานแล้ว จะช้าหรือไม่ช้าก็จบไปแล้ว ขึ้น "เลยกำหนด" แดง ๆ
 * บนงานที่ส่งไปแล้วคือกล่าวหาครีเอเตอร์ผิด ๆ และงานที่ปิดไปแล้ว (ยกเลิก/ปฏิเสธ/หมดอายุ) ก็เช่นกัน
 * เขียนเป็นรายการที่ "นับ" — สถานะใหม่ที่เพิ่มทีหลังจะไม่ขึ้นแดงจนกว่าจะมีคนตัดสินใจ
 */
const DUE_TRACKED: readonly OrderStatus[] = [
  "requested",
  "reviewing",
  "quoted",
  "accepted",
  "in_progress",
  "in_review",
  "revision_requested",
];

export type DueOrder = {
  status: OrderStatus;
  dueAt: Date | string | null;
  createdAt: Date | string;
  depositCents: number;
  amountPaidCents: number;
  depositMetAt: Date | string | null;
};

/**
 * ยังไม่ตอบรับงาน — ครีเอเตอร์ยังไม่ได้รับกำหนดส่งจริง `dueAt` ตอนนี้เป็นแค่ตัวเลขชั่วคราว
 * (ออเดอร์ไม่มีมัดจำจะถูกตั้งใหม่ตอนตอบรับ มีมัดจำจะถูกตั้งใหม่ตอนมัดจำครบ)
 */
const BEFORE_ACCEPT: readonly OrderStatus[] = ["requested", "reviewing", "quoted"];

/**
 * ใครเป็นคนดู — กำหนดส่งเป็นของครีเอเตอร์ แต่บางช่วงตาเดินอยู่ที่ลูกค้า
 * ⚠️ ค่าเริ่มต้นเป็นครีเอเตอร์ (เห็นทุกอย่าง) หน้าของลูกค้าต้องส่ง "client" เอง
 */
export type DueViewer = "creator" | "client";

/**
 * สถานะของกำหนดส่ง
 *
 *   none           — ไม่มีอะไรให้นับ (ไม่มีกำหนด / ส่งแล้ว / จบแล้ว)
 *   after_deposit  — ยังไม่เริ่มนับ รอมัดจำ: `dueAt` ตอนนี้เป็นแค่ตัวเลขชั่วคราว
 *                    จะถูกตั้งใหม่ตอนมัดจำครบ (`days` = ระยะเวลาทำงานที่ตกลงไว้)
 *   after_accept   — ยังไม่เริ่มนับ รอตอบรับงาน (ไม่มีมัดจำ): จะถูกตั้งใหม่ตอนตอบรับ
 *   awaiting_review — (เฉพาะลูกค้า) งานรอลูกค้าตรวจพรีวิวอยู่ ไม่ขึ้นเลยกำหนดแดงใส่ลูกค้า
 *   overdue        — เลยกำหนดแล้ว
 *   running        — ยังไม่ถึงกำหนด
 *
 * ⚠️ after_deposit / after_accept ต้องไม่ขึ้นเลยกำหนด — ครีเอเตอร์ลงมือไม่ได้จนกว่าจะตอบรับ
 * และมัดจำเข้า (ด่าน `depositSatisfied` ใน transitionOrder) เวลาที่รอลูกค้าตัดสินใจราคาหรือรอโอน
 * ไม่ใช่ความผิดของครีเอเตอร์ — เดิม `quoted` ของออเดอร์ไม่มีมัดจำขึ้น "เลยกำหนด" ได้
 * ทั้งที่งานยังไม่เคยถูกรับด้วยซ้ำ
 */
export type DueState =
  | { kind: "none" }
  | { kind: "after_deposit"; days: number }
  | { kind: "after_accept"; days: number }
  | { kind: "awaiting_review" }
  | { kind: "overdue" }
  | { kind: "running" };

const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

/** ยังรอมัดจำครั้งแรกอยู่ไหม — ยอดยังไม่ถึงและไม่เคยถึง */
export function awaitingDeposit(o: Pick<DueOrder, "depositCents" | "amountPaidCents" | "depositMetAt">): boolean {
  return o.depositCents > 0 && o.amountPaidCents < o.depositCents && !o.depositMetAt;
}

/**
 * ⚠️ ตัดสินที่นี่ที่เดียว — บอร์ด แดชบอร์ด หน้างานครีเอเตอร์ และหน้าลูกค้า ใช้ตัวนี้ (ผ่าน `dueLabel`)
 *
 * `viewer = "client"` ต่างจากครีเอเตอร์แค่ตอน `in_review`: ครีเอเตอร์ส่งพรีวิวแล้ว ตาเดินอยู่ที่ลูกค้า
 * ขึ้น "เลยกำหนด" แดง ๆ ใส่ลูกค้าตอนที่คนที่ต้องขยับคือตัวเขาเอง อ่านเหมือนครีเอเตอร์ทิ้งงาน
 * ครีเอเตอร์ยังเห็นสถานะจริง (งานยังไม่ส่งมอบ กำหนดส่งยังเดินอยู่ — `in_review` ไม่หยุดนาฬิกา)
 */
export function dueState(o: DueOrder, now: Date = new Date(), viewer: DueViewer = "creator"): DueState {
  if (!o.dueAt || !DUE_TRACKED.includes(o.status)) return { kind: "none" };
  const due = toDate(o.dueAt);
  const days = () => Math.max(0, Math.round((due.getTime() - toDate(o.createdAt).getTime()) / DAY_MS));
  if (awaitingDeposit(o)) return { kind: "after_deposit", days: days() };
  /**
   * ยังไม่ตอบรับ = ยังไม่เริ่มนับ ไม่ว่าออเดอร์เก่าหรือใหม่
   * ไม่ต้องดู `depositMetAt`: ไม่มีเส้นถอยจาก `accepted` กลับมาสถานะพวกนี้ (state-machine.ts)
   * ออเดอร์ที่ยังอยู่ตรงนี้จึงยังไม่เคยเริ่มนับแน่นอน
   */
  if (BEFORE_ACCEPT.includes(o.status)) return { kind: "after_accept", days: days() };
  if (viewer === "client" && o.status === "in_review") return { kind: "awaiting_review" };
  return due.getTime() < now.getTime() ? { kind: "overdue" } : { kind: "running" };
}

export function isOverdue(o: DueOrder, now: Date = new Date(), viewer: DueViewer = "creator"): boolean {
  return dueState(o, now, viewer).kind === "overdue";
}
