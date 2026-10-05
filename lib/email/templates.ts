import { fill, getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { formatMoney } from "@/lib/format";
import { dueNowCents, paymentState } from "@/lib/payments/money";
import { moneyMoved } from "@/lib/orders/cancel";
import { closedEarly } from "@/lib/orders/state-machine";
import type { NotificationData, NotificationType } from "@/lib/notifications/types";
import type { OrderStatus } from "@/lib/types";

/**
 * ประกอบข้อความอีเมลจาก "ข้อเท็จจริงของออเดอร์" — ไฟล์นี้ไม่แตะ DB และไม่แตะ Next
 * จึงทดสอบได้ตรง ๆ (templates.test.ts) ส่วนการอ่าน DB และการส่งอยู่ใน notify.ts
 *
 * ⚠️ **ข้อมูลในอีเมลมาจากออเดอร์ ไม่ใช่จากผู้เรียก `notify()`**
 * เดิมแต่ละจุดส่งคีย์มาเอง อีเมลคำขอใหม่จึงขึ้น "{client}" ตัวอักษรดิบกับยอดเงินว่าง
 * เพราะผู้เรียกส่งมาแค่ `{code, service}` และอีเมลยืนยันเงินเข้าต้องการคีย์ที่ไม่มีใครส่ง
 * ตอนนี้ผู้เรียกส่งมาแค่สิ่งที่หาจากออเดอร์ไม่ได้ (ดู `NotificationData`) ที่เหลืออ่านเอง
 */

/* ── อีเมลแบบไหนส่งเมื่อไร ────────────────────────────────────────── */

export const EMAIL_KINDS = [
  "order_created",
  "order_accepted",
  "order_declined",
  "order_cancelled",
  "order_closed_early",
  "quote_issued",
  "quote_accepted",
  "delivery_released",
  "invite_claimed",
  "invite_confirmed",
  "payment_reported",
  "payment_recorded_by_creator",
  "payment_confirmed",
  "payment_rejected",
  "payment_voided",
  "auto_complete_soon",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

export type EmailRole = "client" | "creator";

/**
 * อีเมลแต่ละแบบเขียนถึงใคร — ส่งผิดฝั่งแล้ว **ไม่ส่งเลย** ดีกว่าส่งเรื่องผิดคน
 *
 * เดิมตอนครีเอเตอร์ยืนยันคำเชิญ ลูกค้าได้อีเมล "มีคำขอใหม่" ที่เขียนถึงครีเอเตอร์
 * ด่านนี้ทำให้ความผิดแบบนั้นกลายเป็น log แทนที่จะไปถึงกล่องจดหมายของลูกค้า
 */
const AUDIENCE: Record<EmailKind, EmailRole | "either"> = {
  order_created: "creator",
  order_accepted: "client",
  order_declined: "client",
  order_cancelled: "either",
  order_closed_early: "creator",
  quote_issued: "client",
  quote_accepted: "creator",
  delivery_released: "client",
  invite_claimed: "creator",
  invite_confirmed: "client",
  payment_reported: "creator",
  payment_recorded_by_creator: "client",
  payment_confirmed: "client",
  payment_rejected: "client",
  payment_voided: "client",
  auto_complete_soon: "client",
};

/** สถานะที่อีกฝ่ายต้องรู้ทันที — ที่เหลือดูในเว็บพอ */
const STATUS_EMAIL: Partial<Record<OrderStatus, EmailKind>> = {
  accepted: "order_accepted",
  declined: "order_declined",
  cancelled: "order_cancelled",
};

type KindRule<T extends NotificationType> =
  | EmailKind
  | null
  | ((data: NotificationData[T]) => EmailKind | null);

/**
 * แจ้งเตือนชนิดไหนส่งอีเมลด้วย — **ต้องตัดสินครบทุกชนิด** (TS ฟ้องถ้าเพิ่มชนิดแล้วลืม)
 *
 * ส่งเฉพาะเหตุการณ์ที่อีกฝ่ายต้องลงมือทำ หรือเรื่องเงินที่พลาดแล้วเสียหาย
 * ถ้าไม่ได้เปิดเว็บอยู่ก็ต้องรู้ — ที่เหลือรอดูในกระดิ่งได้
 */
const KIND_OF: { [T in NotificationType]: KindRule<T> } = {
  order_created: "order_created",
  /**
   * ลูกค้าปิดงานระหว่างรอบแก้ — ต้องเป็นอีเมลถึงครีเอเตอร์ ไม่ใช่แค่กระดิ่ง
   * ⚠️ ครีเอเตอร์อาจยังนั่งแก้งานอยู่นอกเว็บ งานนั้นไม่มีวันถูกส่งแล้ว (ออเดอร์ที่ปิดรับไฟล์ส่งมอบไม่ได้)
   * ยกเลิก/ปฏิเสธซึ่งก็ทำให้งานจบส่งอีเมลอยู่แล้ว เส้นนี้ต้องไม่เงียบกว่า
   * ปิดจาก `delivered` (ลูกค้ากดรับงาน / cron ปิดให้) ไม่ส่ง — ไม่มีงานค้างให้ใครเสียแรงต่อ
   */
  order_status_changed: (d) =>
    closedEarly(d.from, d.to) ? "order_closed_early" : (STATUS_EMAIL[d.to] ?? null),
  /**
   * ⚠️ ข้อความแชทไม่ส่งอีเมล — ถี่เกินไป คุยกันสิบข้อความ = อีเมลสิบฉบับ
   * แผนคือ digest วันละครั้ง (docs/01 §6) ยังไม่ได้ทำ
   */
  order_message: null,
  payment_reported: "payment_reported",
  payment_recorded_by_creator: "payment_recorded_by_creator",
  payment_confirmed: "payment_confirmed",
  payment_rejected: "payment_rejected",
  payment_voided: "payment_voided",
  invite_claimed: "invite_claimed",
  invite_confirmed: "invite_confirmed",
  quote_issued: "quote_issued",
  quote_accepted: "quote_accepted",
  delivery_released: "delivery_released",
  work_preview_uploaded: null,
  work_preview_approved: null,
  /**
   * ต้องเป็นอีเมล ไม่ใช่แค่กระดิ่ง — ลูกค้าที่ได้ไฟล์ไปแล้วมักไม่กลับมาเปิดเว็บ
   * ถ้ารู้ตัวหลังงานถูกปิดไปแล้วว่าไฟล์ผิด ปุ่มขอแก้ไขก็หายไปแล้ว
   */
  order_auto_complete_soon: "auto_complete_soon",
  /**
   * รีวิวแค่กระดิ่ง ไม่ส่งอีเมล — ไม่มีใครต้องรีบลงมือทำอะไร และไม่ใช่เรื่องเงิน
   * ครีเอเตอร์เปิดเว็บมาดูงานอยู่แล้ว เห็นกระดิ่งก็ตอบได้
   */
  review_posted: null,
  review_replied: null,
};

export function emailKindFor<T extends NotificationType>(
  type: T,
  data: NotificationData[T],
): EmailKind | null {
  const rule = KIND_OF[type] as KindRule<T>;
  return typeof rule === "function" ? rule(data) : rule;
}

/* ── ข้อเท็จจริงที่อ่านจาก DB ─────────────────────────────────────── */

export type OrderFacts = {
  code: string;
  /** null = ออเดอร์ไม่ได้ผูกกับเมนูแล้ว (เมนูถูกลบ) */
  service: string | null;
  clientName: string | null;
  shopName: string | null;
  currency: string;
  totalCents: number;
  depositCents: number;
  paidCents: number;
  /**
   * มีเงินเกี่ยวข้องกับออเดอร์นี้ไหม — ผลเดียวกับ `moneyMoved()` ที่ใช้เตือนก่อนกดยกเลิก
   * (รวมรายการที่รอยืนยันหรือถูกตอบว่ายังไม่ได้รับ ไม่ใช่แค่ยอดที่ยืนยันแล้ว)
   */
  moneyMoved: boolean;
  /** ใบเสนอราคาที่ยังเปิดอยู่ — null เมื่อไม่มี (ถูกถอนหรือยอมรับไปแล้ว) */
  liveQuote: { totalCents: number; depositCents: number } | null;
};

export type InviteFacts = {
  service: string | null;
  clientName: string | null;
  clientEmail: string;
  shopName: string | null;
  currency: string;
  totalCents: number;
  depositCents: number;
};

export type EmailFacts =
  | { entity: "order"; role: EmailRole; order: OrderFacts }
  | { entity: "invite"; role: EmailRole; invite: InviteFacts };

/** รูปแถวที่ notify.ts อ่านมา — แยกออกมาให้แปลงเป็น facts ได้โดยไม่ต้องมี DB */
export type OrderRow = {
  code: string;
  currency: string;
  totalCents: number;
  depositCents: number;
  amountPaidCents: number;
  client: { name: string } | null;
  page: { displayName: string } | null;
  service: { title: string } | null;
  payments: {
    amountCents: number;
    verifiedAt: Date | null;
    rejectedAt: Date | null;
    voidedAt: Date | null;
  }[];
  quotes: { totalCents: number; depositCents: number }[];
};

export function orderFacts(row: OrderRow): OrderFacts {
  const rows = row.payments.map((p) => ({ amountCents: p.amountCents, state: paymentState(p) }));
  return {
    code: row.code,
    service: row.service?.title?.trim() || null,
    clientName: row.client?.name?.trim() || null,
    shopName: row.page?.displayName?.trim() || null,
    currency: row.currency,
    totalCents: row.totalCents,
    depositCents: row.depositCents,
    paidCents: row.amountPaidCents,
    moneyMoved: moneyMoved(row.amountPaidCents, rows) !== null,
    liveQuote: row.quotes[0] ?? null,
  };
}

/** ลิงก์ในอีเมลคิดจากฝั่งของผู้รับ ไม่ใช่รับมาจากผู้เรียก — สองหน้าเป็นคนละ route */
export function emailPath(facts: EmailFacts): string {
  if (facts.entity === "invite") return "/invites";
  return facts.role === "client"
    ? `/my/requests/${facts.order.code}`
    : `/orders/${facts.order.code}`;
}

/* ── ประกอบข้อความ ─────────────────────────────────────────────── */

export type RenderedEmail = { subject: string; body: string; ctaLabel: string; path: string };

export type RenderResult =
  | { ok: true; email: RenderedEmail }
  | { ok: false; reason: "wrong_audience" | "wrong_entity" | "no_live_quote" | "missing_data"; detail?: string };

/**
 * คีย์ใน template ที่ไม่มีค่าให้ — ตรวจที่ template ไม่ใช่ที่ผลลัพธ์
 * เพราะชื่อร้านมี `{…}` อยู่ในตัวได้จริง แต่นั่นไม่ใช่ placeholder ที่หลุด
 */
export function missingKeys(template: string, vars: Record<string, string | number>): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const v = vars[m[1]];
    if (v === undefined || v === "") out.push(m[1]);
  }
  return out;
}

/**
 * บรรทัด "ต้องจ่ายอะไรตอนนี้" ของลูกค้า — ใช้ `dueNowCents()` ตัวเดียวกับแผงชำระเงินบนหน้างาน
 * ตัวเลขในอีเมลกับตัวเลขที่ลูกค้าเปิดมาเจอต้องเป็นตัวเดียวกันเสมอ
 */
function payLine(
  e: EmailStrings,
  o: OrderFacts,
  money: (c: number) => string,
): { text: string; due: number } {
  const due = dueNowCents({
    totalCents: o.totalCents,
    amountPaidCents: o.paidCents,
    depositCents: o.depositCents,
  });
  if (due <= 0) return { text: e.paidUp, due };
  if (o.depositCents > 0 && o.paidCents < o.depositCents) {
    const t = o.depositCents >= o.totalCents ? e.payUpfront : e.payDeposit;
    return { text: fill(t, { due: money(due) }), due };
  }
  return { text: fill(o.depositCents > 0 ? e.payRest : e.payAnytime, { due: money(due) }), due };
}

/** เงื่อนไขมัดจำเป็นประโยคเดียว — ใบเสนอราคาทั้งสองฝั่งใช้ประโยคเดียวกัน */
function termsLine(
  e: EmailStrings,
  totalCents: number,
  depositCents: number,
  money: (c: number) => string,
): string {
  if (depositCents <= 0) return e.termNone;
  const t = depositCents >= totalCents ? e.termUpfront : e.termDeposit;
  return fill(t, { deposit: money(depositCents) });
}

type EmailStrings = ReturnType<typeof getDictionary>["email"];

export function renderEmail(input: {
  kind: EmailKind;
  /** ข้อมูลที่ผู้เรียก `notify()` ส่งมา — ใช้เฉพาะ `amount` ของรายการเงิน */
  data: Record<string, unknown>;
  facts: EmailFacts;
  locale: Locale;
}): RenderResult {
  const { kind, facts, locale } = input;
  const e = getDictionary(locale).email;

  const audience = AUDIENCE[kind];
  if (audience !== "either" && audience !== facts.role) {
    return { ok: false, reason: "wrong_audience", detail: `${kind} → ${facts.role}` };
  }

  const path = emailPath(facts);

  /* ── คำเชิญ: ยังไม่มีออเดอร์ ── */
  if (kind === "invite_claimed") {
    if (facts.entity !== "invite") return { ok: false, reason: "wrong_entity" };
    const inv = facts.invite;
    const vars = {
      client: inv.clientName ?? e.someClient,
      email: inv.clientEmail,
      service: inv.service ?? e.customWork,
      total: formatMoney(inv.totalCents, inv.currency, locale),
    };
    return finish(e.inviteClaimedSubject, [e.inviteClaimedBody], vars, e.viewInvites, path);
  }

  if (facts.entity !== "order") return { ok: false, reason: "wrong_entity" };
  const o = facts.order;
  const money = (c: number) => formatMoney(c, o.currency, locale);

  /** ยอดของรายการเงินรายการนั้น — มาจากผู้เรียกเพราะไม่ได้อยู่บนออเดอร์ */
  const amount = typeof input.data.amount === "number" ? money(input.data.amount) : "";

  const vars: Record<string, string | number> = {
    code: o.code,
    service: o.service ?? e.customWork,
    client: o.clientName ?? e.someClient,
    shop: o.shopName ?? e.someCreator,
    total: money(o.totalCents),
    paid: money(o.paidCents),
    amount,
  };

  switch (kind) {
    case "order_created":
      return finish(e.orderCreatedSubject, [e.orderCreatedBody], vars, e.viewOrder, path);

    case "order_accepted":
    case "invite_confirmed": {
      const pay = payLine(e, o, money);
      const [subject, body] =
        kind === "order_accepted"
          ? [e.orderAcceptedSubject, e.orderAcceptedBody]
          : [e.inviteConfirmedSubject, e.inviteConfirmedBody];
      return finish(subject, [body, pay.text], vars, pay.due > 0 ? e.payNow : e.viewOrder, path);
    }

    case "order_declined":
      return finish(e.orderDeclinedSubject, [e.orderDeclinedBody], vars, e.viewOrder, path);

    case "order_cancelled": {
      /**
       * ผู้รับคือ "อีกฝ่าย" ของคนที่กดยกเลิก — ลูกค้าได้รับ = ครีเอเตอร์เป็นคนยกเลิก
       * มีเงินเกี่ยวข้องต้องบอกเรื่องคืนเงินเสมอ ตรงกับ dialog ยืนยันก่อนกดยกเลิก
       */
      const byCreator = facts.role === "client";
      const lines = byCreator ? [e.orderCancelledByCreatorBody] : [e.orderCancelledByClientBody];
      // ยอดที่ยืนยันแล้วบอกเฉพาะเมื่อมี — มีแค่รายการแจ้งโอนค้าง "ยืนยันแล้ว ฿0" อ่านแล้วงง
      if (o.paidCents > 0) lines.push(byCreator ? e.cancelledPaidClient : e.cancelledPaidCreator);
      if (o.moneyMoved) lines.push(byCreator ? e.cancelledMoneyClient : e.cancelledMoneyCreator);
      const subject = byCreator ? e.orderCancelledByCreatorSubject : e.orderCancelledByClientSubject;
      return finish(subject, lines, vars, e.viewOrder, path);
    }

    case "order_closed_early":
      return finish(
        e.orderClosedEarlySubject,
        [e.orderClosedEarlyBody, e.orderClosedEarlyFiles],
        vars,
        e.viewOrder,
        path,
      );

    case "quote_issued": {
      // ใบถูกถอนไปแล้วระหว่างรอส่ง — ไม่ส่งตัวเลขของใบที่กดยอมรับไม่ได้แล้ว
      if (!o.liveQuote) return { ok: false, reason: "no_live_quote" };
      const q = o.liveQuote;
      const qVars = { ...vars, total: money(q.totalCents) };
      const terms = termsLine(e, q.totalCents, q.depositCents, money);
      return finish(
        e.quoteIssuedSubject,
        [e.quoteIssuedBody, terms, e.quoteIssuedAction],
        qVars,
        e.viewQuote,
        path,
      );
    }

    case "quote_accepted": {
      // ยอมรับแล้วราคาของใบถูกเขียนลงออเดอร์ในคำสั่งเดียวกัน — อ่านจากออเดอร์ได้เลย
      const terms = termsLine(e, o.totalCents, o.depositCents, money);
      return finish(e.quoteAcceptedSubject, [e.quoteAcceptedBody, terms], vars, e.viewOrder, path);
    }

    case "delivery_released":
      return finish(e.deliveryReleasedSubject, [e.deliveryReleasedBody], vars, e.download, path);

    case "payment_reported":
      return finish(e.paymentReportedSubject, [e.paymentReportedBody], vars, e.viewOrder, path);
    case "payment_recorded_by_creator":
      return finish(e.paymentRecordedSubject, [e.paymentRecordedBody], vars, e.viewOrder, path);
    case "payment_confirmed":
      return finish(e.paymentConfirmedSubject, [e.paymentConfirmedBody], vars, e.viewOrder, path);
    case "payment_rejected":
      return finish(e.paymentRejectedSubject, [e.paymentRejectedBody], vars, e.payNow, path);
    case "payment_voided":
      return finish(e.paymentVoidedSubject, [e.paymentVoidedBody], vars, e.viewOrder, path);

    case "auto_complete_soon": {
      // จำนวนวันมาจาก cron (ค่าคงที่ของกติกา) — ไม่มี = ไม่ส่ง ดีกว่า "จะปิดในอีก  วัน"
      const days = typeof input.data.days === "number" ? input.data.days : "";
      // ชื่อปุ่มเอาจากปุ่มจริงบนหน้างาน — พิมพ์ซ้ำในอีเมลแล้ววันหนึ่งปุ่มเปลี่ยนชื่อ ลูกค้าจะหาไม่เจอ
      const button = getDictionary(locale).orderAction.requestRevision;
      return finish(
        e.autoCompleteSoonSubject,
        [e.autoCompleteSoonBody, e.autoCompleteSoonHow],
        { ...vars, days, button },
        e.viewOrder,
        path,
      );
    }
  }
}

/**
 * เติมค่าแล้วตรวจว่าไม่มีช่องไหนว่าง — ขาดแม้แต่ช่องเดียว **ไม่ส่ง**
 *
 * อีเมลที่ขึ้น "{client}" หรือ "ยอด " เปล่า ๆ ทำให้ระบบดูพังในสายตาคนที่
 * กำลังจะโอนเงินให้เรา ไม่ส่งแล้ว log ไว้ดีกว่า — แจ้งเตือนในเว็บยังอยู่
 */
function finish(
  subjectTpl: string,
  bodyTpls: string[],
  vars: Record<string, string | number>,
  ctaLabel: string,
  path: string,
): RenderResult {
  const missing = [subjectTpl, ...bodyTpls].flatMap((tpl) => missingKeys(tpl, vars));
  if (missing.length > 0) {
    return { ok: false, reason: "missing_data", detail: [...new Set(missing)].join(",") };
  }
  return {
    ok: true,
    email: {
      subject: fill(subjectTpl, vars),
      body: bodyTpls.map((tpl) => fill(tpl, vars)).join("\n\n"),
      ctaLabel,
      path,
    },
  };
}
