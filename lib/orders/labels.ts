import { fill, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { daysUntil, formatDate, formatMoney } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import type { Actor } from "./state-machine";
import { dueState, type DueOrder } from "./lifecycle";

/**
 * ปุ่มบน action bar มาจาก `allowedNext()` เสมอ ไม่ใช่รายการที่เขียนตายไว้
 *
 * ถ้า hardcode ปุ่มไว้ วันที่แก้ state machine จะเหลือปุ่มที่กดแล้วเซิร์ฟเวอร์ปฏิเสธ
 * หรือหายไปทั้งที่ยังทำได้ ที่นี่ทำหน้าที่เดียวคือ "สถานะปลายทาง → ข้อความบนปุ่ม"
 *
 * ข้อความต่างกันตามคนกด — ครีเอเตอร์กด `cancelled` คือ "ยกเลิกงาน"
 * ส่วนลูกค้ากด `cancelled` ก็คำเดียวกัน แต่ `completed` ของลูกค้าคือ "ยืนยันรับงาน"
 * ซึ่งครีเอเตอร์กดแทนไม่ได้อยู่แล้ว
 */
export function actionLabel(
  t: Dictionary,
  to: OrderStatus,
  actor: Actor,
  /** สถานะตอนนี้ — ปลายทางเดียวกันจากคนละต้นทางอาจต้องใช้คำต่างกัน */
  from?: OrderStatus,
): string {
  const a = t.orderAction;
  switch (to) {
    case "reviewing":
      return a.startReview;
    case "quoted":
      return a.sendQuote;
    case "accepted":
      // ครีเอเตอร์ = รับงานเข้าคิว · ลูกค้า = ตอบรับใบเสนอราคา
      return actor === "creator" ? a.acceptOrder : a.markComplete;
    case "in_progress":
      // ถอยจากรอบตรวจกลับมาทำต่อ ไม่ใช่ "เริ่มทำงาน" — งานเริ่มไปนานแล้ว
      return from === "in_review" ? a.backToWork : a.startWork;
    case "in_review":
      return a.submitWip;
    case "delivered":
      return a.deliver;
    case "revision_requested":
      // ครีเอเตอร์กด = เปิดรอบแก้เอง (ไม่นับสิทธิ์ลูกค้า) ต้องใช้คำที่ไม่ฟังเหมือนขอแก้แทนลูกค้า
      return actor === "creator" ? a.reopenForFix : a.requestRevision;
    case "completed":
      return a.markComplete;
    case "declined":
      return a.decline;
    case "cancelled":
      return a.cancel;
    default:
      return t.order.moveTo;
  }
}

/**
 * ปุ่มไหนควรเป็นปุ่มหลัก — มีได้ปุ่มเดียวเท่านั้น
 *
 * ถ้าทุกปุ่มเด่นเท่ากัน คนจะไม่รู้ว่าปกติควรกดอันไหน และปุ่มทำลาย
 * (ปฏิเสธ/ยกเลิก) ต้องไม่มีวันเป็นปุ่มหลัก ไม่งั้นมีคนกดพลาดแน่นอน
 */
export function isPrimaryAction(to: OrderStatus): boolean {
  return !["declined", "cancelled", "expired"].includes(to);
}

/**
 * ข้อความบอกสถานะของออเดอร์ที่จบแล้ว — แทนที่แผงชำระเงินบนหน้าออเดอร์
 *
 * เดิมออเดอร์ที่ยกเลิก/ปฏิเสธ/หมดอายุ ตกไปอยู่ข้อความ "ยังไม่ต้องโอน รอครีเอเตอร์ตอบรับ"
 * ซึ่งพูดผิดทั้งสองท่อน: ไม่มีใครรออะไรอยู่แล้ว และมันทำเหมือนเงินยังไม่เคยขยับ
 *
 * คืน null สำหรับสถานะที่ยังไม่จบ — ผู้เรียกไม่ต้องเดาเองว่าสถานะไหนมีข้อความ
 */
export function closedText(
  t: Dictionary,
  status: OrderStatus,
): { title: string; body: string } | null {
  const c = t.orderClosed;
  switch (status) {
    case "cancelled":
      return { title: c.cancelled, body: c.cancelledBody };
    case "declined":
      return { title: c.declined, body: c.declinedBody };
    case "expired":
      return { title: c.expired, body: c.expiredBody };
    case "completed":
      return { title: c.completed, body: c.completedBody };
    default:
      return null;
  }
}

/**
 * event ของเงิน — ข้อความมี `{amount}` ที่ต้องจัดรูปตามภาษาคนอ่าน
 * DB เก็บเป็นสตางค์ (ตัวเลข) ไม่ใช่ "฿1,500" สำเร็จรูป ด้วยเหตุผลเดียวกับที่เก็บ key แทนประโยค
 */
const PAYMENT_EVENTS = [
  "payment_reported",
  "payment_recorded",
  "payment_confirmed",
  "payment_rejected",
  "payment_voided",
] as const;

/** ข้อความของ event บน timeline — แปลตอนแสดง ไม่ได้เก็บเป็นข้อความใน DB */
export function eventText(
  t: Dictionary,
  eventType: string | null,
  data: Record<string, string | number> | null,
  locale: Locale = "th",
): string | null {
  const paymentEvent = PAYMENT_EVENTS.find((e) => e === eventType);
  if (paymentEvent) {
    const amount = Number(data?.amount);
    // ยอดหาย/เพี้ยน = ไม่ใส่ตัวเลขดีกว่าขึ้น "฿NaN" ในเธรดที่เป็นหลักฐานเรื่องเงิน
    const shown = Number.isFinite(amount) ? formatMoney(amount, "THB", locale) : "";
    return t.orderEvent[paymentEvent].replace("{amount}", shown).trim();
  }
  if (eventType === "order_created") return t.orderEvent.order_created;
  if (eventType === "quote_issued") return t.orderEvent.quote_issued;
  if (eventType === "quote_accepted") return t.orderEvent.quote_accepted;
  if (eventType === "quote_withdrawn") return t.orderEvent.quote_withdrawn;
  if (eventType === "invite_confirmed") return t.orderEvent.invite_confirmed;
  if (eventType === "deposit_met") {
    /**
     * กำหนดส่งใหม่ถูกเก็บไว้ใน event ตอนเขียน (`recomputePaid`) — ไม่ใช่อ่าน `order.dueAt` ปัจจุบัน
     * เพราะ event คือหลักฐานว่า "ตอนนั้นนาฬิกาเริ่มที่ไหน" วันที่ไม่มี/อ่านไม่ออกก็ไม่ใส่ ไม่เดา
     */
    const due = typeof data?.due === "string" ? new Date(data.due) : null;
    const base = t.orderEvent.deposit_met;
    if (!due || Number.isNaN(due.getTime())) return base;
    return `${base} · ${fill(t.orderEvent.dueOn, { date: formatDate(due, locale) })}`;
  }
  if (eventType === "auto_complete_warned") {
    const days = Number(data?.days);
    // ไม่มีจำนวนวัน = ไม่แสดง ดีกว่าขึ้น "ในอีก  วัน" ในเธรดที่เป็นหลักฐาน
    if (!Number.isInteger(days) || days <= 0) return null;
    return fill(t.orderEvent.auto_complete_warned, { days });
  }
  if (eventType === "status_changed") {
    const to = String(data?.to ?? "") as OrderStatus;
    const label = t.orderStatus[to] ?? to;
    const text = t.orderEvent.status_changed.replace("{status}", label);
    /**
     * ขอแก้ไขที่นับโควตาแล้วต่อท้ายด้วย "ครั้งที่ n จาก N" — event เก่าก่อนมีโควตาไม่มีเลขนี้
     * ก็แสดงแค่สถานะเหมือนเดิม ไม่เดาเลขให้ (เดาผิดในหลักฐานแย่กว่าไม่มี)
     */
    const n = Number(data?.revision);
    const total = Number(data?.revisionsAllowed);
    if (to === "revision_requested" && Number.isInteger(n) && n > 0 && Number.isInteger(total)) {
      return `${text} · ${fill(t.orderEvent.revisionRound, { n, total })}`;
    }
    return text;
  }
  // event ที่ยังไม่มีข้อความรองรับ — ไม่แสดงดีกว่าโชว์ key ดิบให้ผู้ใช้เห็น
  return null;
}

export function actorText(t: Dictionary, actor: string | undefined): string {
  if (actor === "creator") return t.orderEvent.byCreator;
  if (actor === "client") return t.orderEvent.byClient;
  return t.orderEvent.bySystem;
}

/**
 * ป้ายกำหนดส่ง — บอร์ด หน้างานฝั่งครีเอเตอร์ และหน้างานฝั่งลูกค้าใช้ตัวนี้ตัวเดียว
 *
 * เดิมแต่ละหน้าคิด `daysUntil(dueAt) < 0` เอง จึงขึ้น "เลย N วัน" สีแดงบนงานที่ส่งไปแล้ว
 * งานที่เสร็จ/ยกเลิกไปแล้ว และงานที่ยังรอลูกค้าโอนมัดจำ (ซึ่งครีเอเตอร์เริ่มไม่ได้)
 * ตัดสินว่าเลยกำหนดไหมที่ `dueState()` ส่วนตรงนี้แค่แปลงเป็นข้อความ
 *
 * คืน null = ไม่ต้องแสดงอะไร (ไม่มีกำหนด / ส่งแล้ว / จบแล้ว)
 * จำนวนวันนับแบบวันปฏิทินด้วย `daysUntil` เหมือนเดิม — เลยมาไม่กี่ชั่วโมงในวันเดียวกันขึ้นแค่ "เลยกำหนด"
 */
export type DueLabel = {
  /** รอมัดจำอยู่ = `dueAt` เป็นตัวเลขชั่วคราว ห้ามโชว์เป็นวันที่ */
  kind: "after_deposit" | "overdue" | "running";
  text: string;
  tone: "overdue" | "soon" | "normal";
};

export function dueLabel(t: Dictionary, o: DueOrder, now: Date = new Date()): DueLabel | null {
  const state = dueState(o, now);
  switch (state.kind) {
    case "none":
      return null;
    case "after_deposit":
      return {
        kind: state.kind,
        text: fill(t.order.dueAfterDeposit, { n: state.days }),
        tone: "normal",
      };
    case "overdue": {
      const late = -daysUntil(o.dueAt!, now);
      return {
        kind: state.kind,
        text: late > 0 ? fill(t.order.overdueDays, { n: late }) : t.order.overdue,
        tone: "overdue",
      };
    }
    case "running": {
      const left = daysUntil(o.dueAt!, now);
      return {
        kind: state.kind,
        text: left <= 0 ? t.order.dueToday : fill(t.order.daysLeft, { n: left }),
        tone: left <= 2 ? "soon" : "normal",
      };
    }
  }
}
