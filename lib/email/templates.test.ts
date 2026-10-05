import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMAIL_KINDS,
  emailKindFor,
  emailPath,
  missingKeys,
  orderFacts,
  renderEmail,
  type EmailFacts,
  type EmailKind,
  type EmailRole,
  type OrderFacts,
  type OrderRow,
} from "./templates";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localeFromAcceptLanguage, LOCALES, type Locale } from "@/lib/i18n/config";
import { formatMoney } from "@/lib/format";
import {
  NOTIFICATION_TYPES,
  type NotificationData,
  type NotificationType,
} from "@/lib/notifications/types";
import { ORDER_STATUSES } from "@/lib/types";

const CODE = "K7M2QX4P";
const PLACEHOLDER = /\{\w+\}/;
const THAI = /[฀-๿]/;

/**
 * ข้อมูลที่ผู้เรียก `notify()` ส่งมาจริง แยกตามชนิด — type บังคับให้มีครบทุกชนิด
 * เพิ่มชนิดใหม่แล้วไม่เพิ่มตรงนี้ = tsc ไม่ผ่าน
 */
const CALLER_DATA: { [T in NotificationType]: NotificationData[T] } = {
  order_created: { code: CODE, service: "Bust sketch" },
  order_status_changed: { code: CODE, from: "requested", to: "accepted" },
  order_message: { code: CODE, preview: "hello" },
  payment_reported: { code: CODE, amount: 55_000 },
  payment_recorded_by_creator: { code: CODE, amount: 55_000 },
  payment_confirmed: { code: CODE, amount: 55_000 },
  payment_rejected: { code: CODE, amount: 55_000 },
  payment_voided: { code: CODE, amount: 55_000 },
  invite_claimed: {},
  invite_confirmed: { code: CODE },
  quote_issued: { code: CODE },
  quote_accepted: { code: CODE },
  delivery_released: { code: CODE },
  work_preview_uploaded: { code: CODE },
  work_preview_approved: { code: CODE },
  order_auto_complete_soon: { code: CODE, days: 2 },
  review_posted: { code: CODE },
  review_replied: { code: CODE },
};

/** ออเดอร์ตัวอย่าง — ชื่อเป็น ASCII เพื่อเช็คได้ว่าอีเมลภาษาอังกฤษไม่มีภาษาไทยหลุดมา */
function order(over: Partial<OrderFacts> = {}): OrderFacts {
  return {
    code: CODE,
    service: "Bust sketch",
    clientName: "Mali",
    shopName: "Nongfah Studio",
    currency: "THB",
    totalCents: 110_000,
    depositCents: 55_000,
    paidCents: 0,
    moneyMoved: false,
    liveQuote: { totalCents: 135_000, depositCents: 67_500 },
    ...over,
  };
}

const INVITE: EmailFacts = {
  entity: "invite",
  role: "creator",
  invite: {
    service: "Full render",
    clientName: "Mali",
    clientEmail: "mali@example.com",
    shopName: "Nongfah Studio",
    currency: "THB",
    totalCents: 250_000,
    depositCents: 125_000,
  },
};

/** ผู้รับของแต่ละแบบ — ยกเลิกส่งได้ทั้งสองฝั่ง */
const ROLES: Record<EmailKind, EmailRole[]> = {
  order_created: ["creator"],
  order_accepted: ["client"],
  order_declined: ["client"],
  order_cancelled: ["client", "creator"],
  order_closed_early: ["creator"],
  quote_issued: ["client"],
  quote_accepted: ["creator"],
  delivery_released: ["client"],
  invite_claimed: ["creator"],
  invite_confirmed: ["client"],
  payment_reported: ["creator"],
  payment_recorded_by_creator: ["client"],
  payment_confirmed: ["client"],
  payment_rejected: ["client"],
  payment_voided: ["client"],
  auto_complete_soon: ["client"],
};

/** ออเดอร์หลายหน้าตาที่เจอได้จริง — ไม่มีมัดจำ / มัดจำบางส่วน / เต็มจำนวน / จ่ายแล้วบางส่วน / จ่ายครบ */
const ORDER_SHAPES: Array<[string, OrderFacts]> = [
  ["มัดจำ 50% ยังไม่จ่าย", order()],
  ["ไม่มีมัดจำ", order({ depositCents: 0 })],
  ["มัดจำ 100%", order({ depositCents: 110_000 })],
  ["จ่ายมัดจำแล้ว", order({ paidCents: 55_000, moneyMoved: true })],
  ["จ่ายครบ", order({ paidCents: 110_000, moneyMoved: true })],
  ["เมนูถูกลบ ไม่มีชื่อลูกค้า", order({ service: null, clientName: null, shopName: null })],
];

/** คู่ (ชนิดแจ้งเตือน, ข้อมูล) ทุกแบบที่ทำให้เกิดอีเมลได้ — ต่อสถานะด้วยสำหรับ order_status_changed */
function emailingCalls(): Array<{ type: NotificationType; data: Record<string, unknown>; kind: EmailKind }> {
  const out: Array<{ type: NotificationType; data: Record<string, unknown>; kind: EmailKind }> = [];
  for (const type of NOTIFICATION_TYPES) {
    if (type === "order_status_changed") {
      // ทุกคู่ต้นทาง→ปลายทาง — อีเมลบางแบบขึ้นกับต้นทาง (ลูกค้าปิดงานระหว่างรอบแก้)
      for (const from of ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
          const data = { code: CODE, from, to };
          const kind = emailKindFor("order_status_changed", data);
          if (kind) out.push({ type, data, kind });
        }
      }
      continue;
    }
    const data = CALLER_DATA[type];
    const kind = emailKindFor(type, data as never);
    if (kind) out.push({ type, data, kind });
  }
  return out;
}

describe("อีเมลแจ้งเตือน — ทุกแบบ ทุกภาษา ด้วยข้อมูลที่โค้ดส่งมาจริง", () => {
  it("ทุกแบบในรายการมีทางถูกส่งจริง ไม่มีแบบที่ไม่มีใครเรียก", () => {
    const reached = new Set(emailingCalls().map((c) => c.kind));
    for (const kind of EMAIL_KINDS) assert.ok(reached.has(kind), `${kind} ไม่มีเส้นทางไหนส่ง`);
  });

  it("ไม่มี {placeholder} หลุด ไม่มีช่องว่าง ไม่มี undefined/NaN — ทั้งไทยและอังกฤษ", () => {
    let rendered = 0;
    for (const call of emailingCalls()) {
      for (const role of ROLES[call.kind]) {
        const shapes: Array<[string, EmailFacts]> =
          call.kind === "invite_claimed"
            ? [["คำเชิญ", INVITE]]
            : ORDER_SHAPES.map(([name, o]) => [name, { entity: "order", role, order: o }]);
        for (const [shape, facts] of shapes) {
          for (const locale of LOCALES) {
            const label = `${call.type}→${call.kind} (${role}, ${shape}, ${locale})`;
            const r = renderEmail({ kind: call.kind, data: call.data, facts, locale });
            assert.ok(r.ok, `${label}: ${!r.ok ? `${r.reason} ${r.detail ?? ""}` : ""}`);
            const { subject, body, ctaLabel, path } = r.email;
            for (const text of [subject, body, ctaLabel]) {
              assert.equal(PLACEHOLDER.test(text), false, `${label} เหลือ placeholder: ${text}`);
              assert.equal(/undefined|NaN|null/.test(text), false, `${label}: ${text}`);
              assert.ok(text.trim().length > 0, `${label} ว่าง`);
            }
            assert.ok(path.startsWith("/"), label);
            if (locale === "en") {
              assert.equal(THAI.test(subject + body + ctaLabel), false, `${label} มีภาษาไทยปน`);
            }
            rendered++;
          }
        }
      }
    }
    assert.ok(rendered > 100, `เรนเดอร์ไป ${rendered} ฉบับ`);
  });

  it("ทุกคีย์ใน email.* ถูกใช้จริง — ไม่มีข้อความที่เทสต์ไม่เคยเรนเดอร์", () => {
    const src =
      readFileSync(join(import.meta.dirname, "templates.ts"), "utf8") +
      readFileSync(join(import.meta.dirname, "notify.ts"), "utf8");
    for (const key of Object.keys(getDictionary("th").email)) {
      assert.ok(
        src.includes(`e.${key}`) || src.includes(`.email.${key}`),
        `email.${key} ไม่มีใครใช้ — ลบทิ้งหรือต่อเข้ากับอีเมลสักแบบ`,
      );
    }
  });

  it("สองภาษามีคีย์ email ครบเท่ากัน", () => {
    assert.deepEqual(
      Object.keys(getDictionary("en").email).sort(),
      Object.keys(getDictionary("th").email).sort(),
    );
  });
});

describe("ส่งเมื่อไร", () => {
  it("ข้อความแชทไม่ส่งอีเมล", () => {
    assert.equal(emailKindFor("order_message", CALLER_DATA.order_message), null);
  });

  it("เปลี่ยนสถานะ: ส่งเฉพาะตอบรับ ปฏิเสธ ยกเลิก", () => {
    const kinds = ORDER_STATUSES.map((to) => [
      to,
      emailKindFor("order_status_changed", { code: CODE, from: "requested", to }),
    ]);
    assert.deepEqual(Object.fromEntries(kinds.filter(([, k]) => k)), {
      accepted: "order_accepted",
      declined: "order_declined",
      cancelled: "order_cancelled",
    });
  });

  it("เหตุการณ์ที่อีกฝ่ายต้องลงมือทำส่งอีเมลครบ", () => {
    for (const type of [
      "order_created",
      "quote_issued",
      "quote_accepted",
      "delivery_released",
      "invite_claimed",
      "invite_confirmed",
      "payment_reported",
      "payment_confirmed",
      "payment_rejected",
      "order_auto_complete_soon",
    ] as const) {
      assert.ok(emailKindFor(type, CALLER_DATA[type] as never), type);
    }
  });

  it("ปิดงาน/หมดอายุโดยระบบ ไม่ส่งอีเมลเปลี่ยนสถานะ — อีเมลที่ลูกค้าต้องได้คือคำเตือนก่อนปิด", () => {
    for (const to of ["completed", "expired"] as const) {
      assert.equal(emailKindFor("order_status_changed", { code: CODE, from: "delivered", to }), null, to);
    }
  });

  it("ลูกค้าปิดงานระหว่างรอบแก้ ส่งอีเมลถึงครีเอเตอร์ — อาจยังนั่งแก้งานที่ไม่มีวันถูกส่งอยู่", () => {
    for (const from of ["in_progress", "in_review", "revision_requested"] as const) {
      assert.equal(
        emailKindFor("order_status_changed", { code: CODE, from, to: "completed" }),
        "order_closed_early",
        from,
      );
    }
    // กดรับงานที่ส่งมอบแล้ว = ไม่มีงานค้าง ไม่ส่ง
    assert.equal(emailKindFor("order_status_changed", { code: CODE, from: "delivered", to: "completed" }), null);
  });
});

describe("เนื้อความถูกเรื่อง", () => {
  const client = (o: OrderFacts): EmailFacts => ({ entity: "order", role: "client", order: o });
  const creator = (o: OrderFacts): EmailFacts => ({ entity: "order", role: "creator", order: o });
  const render = (kind: EmailKind, facts: EmailFacts, locale: Locale = "th", data = {}) => {
    const r = renderEmail({ kind, data, facts, locale });
    assert.ok(r.ok, !r.ok ? r.reason : "");
    return r.email;
  };

  it("คำขอใหม่บอกชื่อลูกค้า ชื่องาน และยอดเงิน (เดิมขึ้น {client} กับยอดว่าง)", () => {
    const m = render("order_created", creator(order()), "th", CALLER_DATA.order_created);
    assert.match(m.body, /Mali/);
    assert.match(m.body, /Bust sketch/);
    assert.ok(m.body.includes(formatMoney(110_000, "THB", "th")));
    assert.match(m.subject, new RegExp(CODE));
    assert.equal(m.path, `/orders/${CODE}`);
  });

  it("ตอบรับแล้ว: บอกยอดที่ต้องโอนตอนนี้ ตรงกับแผงชำระเงิน และปุ่มพาไปจ่าย", () => {
    const th = getDictionary("th").email;
    const deposit = render("order_accepted", client(order()));
    assert.ok(deposit.body.includes(formatMoney(55_000, "THB", "th")), deposit.body);
    assert.equal(deposit.ctaLabel, th.payNow);
    assert.equal(deposit.path, `/my/requests/${CODE}`);

    const none = render("order_accepted", client(order({ depositCents: 0 })), "en");
    assert.ok(none.body.includes(formatMoney(110_000, "THB", "en")), none.body);
    assert.match(none.body, /no deposit/i);

    const full = render("order_accepted", client(order({ depositCents: 110_000 })), "en");
    assert.match(full.body, /full/i);

    const paid = render("order_accepted", client(order({ paidCents: 110_000 })));
    assert.equal(paid.ctaLabel, th.viewOrder, "จ่ายครบแล้วไม่ต้องชวนไปจ่าย");
    assert.ok(paid.body.includes(th.paidUp));
  });

  it("คำเชิญที่ยืนยันแล้วเป็นข้อความของลูกค้า ไม่ใช่ 'มีคำขอใหม่'", () => {
    const m = render("invite_confirmed", client(order()), "th", CALLER_DATA.invite_confirmed);
    const th = getDictionary("th").email;
    assert.equal(m.subject.includes("มีคำขอใหม่"), false);
    assert.ok(m.subject.startsWith("Nongfah Studio"));
    assert.ok(m.body.includes(formatMoney(55_000, "THB", "th")));
    assert.equal(m.ctaLabel, th.payNow);
  });

  it("ส่งผิดฝั่ง = ไม่ส่ง (กันบั๊ก order_created ไปถึงลูกค้า)", () => {
    const r = renderEmail({ kind: "order_created", data: {}, facts: client(order()), locale: "th" });
    assert.deepEqual(r.ok ? null : r.reason, "wrong_audience");
    const r2 = renderEmail({ kind: "invite_confirmed", data: {}, facts: creator(order()), locale: "th" });
    assert.deepEqual(r2.ok ? null : r2.reason, "wrong_audience");
    const r3 = renderEmail({ kind: "invite_claimed", data: {}, facts: creator(order()), locale: "th" });
    assert.deepEqual(r3.ok ? null : r3.reason, "wrong_entity");
  });

  it("ขาดยอดของรายการเงิน = ไม่ส่ง แทนที่จะขึ้น 'ได้รับเงิน  แล้ว'", () => {
    const r = renderEmail({
      kind: "payment_confirmed",
      data: { code: CODE },
      facts: client(order()),
      locale: "th",
    });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, "missing_data");
    assert.equal(!r.ok && r.detail, "amount");
  });

  it("ยืนยันเงินเข้า: บอกยอดที่ได้รับ และยอดสะสมจากออเดอร์", () => {
    const m = render(
      "payment_confirmed",
      client(order({ paidCents: 55_000 })),
      "en",
      CALLER_DATA.payment_confirmed,
    );
    assert.ok(m.body.includes(formatMoney(55_000, "THB", "en")));
    assert.ok(m.body.includes(formatMoney(110_000, "THB", "en")));
  });

  it("ใบเสนอราคาใช้ยอดของใบ ไม่ใช่ยอดเดิมของออเดอร์ — และใบถูกถอนแล้วไม่ส่ง", () => {
    const m = render("quote_issued", client(order()), "th", CALLER_DATA.quote_issued);
    assert.ok(m.body.includes(formatMoney(135_000, "THB", "th")), m.body);
    assert.ok(m.body.includes(formatMoney(67_500, "THB", "th")), m.body);
    assert.equal(m.body.includes(formatMoney(110_000, "THB", "th")), false);

    const gone = renderEmail({
      kind: "quote_issued",
      data: {},
      facts: client(order({ liveQuote: null })),
      locale: "th",
    });
    assert.equal(!gone.ok && gone.reason, "no_live_quote");
  });

  it("ยกเลิก: ข้อความตามคนที่ยกเลิก และเตือนเรื่องคืนเงินเฉพาะตอนมีเงินเกี่ยวข้อง", () => {
    const th = getDictionary("th").email;
    const toClient = render("order_cancelled", client(order()));
    assert.ok(toClient.subject.startsWith("Nongfah Studio"), "ลูกค้าได้รับ = ร้านเป็นคนยกเลิก");
    assert.equal(toClient.body.includes("แพลตฟอร์มไม่ได้ถือเงิน"), false);

    const toCreator = render("order_cancelled", creator(order({ paidCents: 55_000, moneyMoved: true })));
    assert.ok(toCreator.subject.startsWith("Mali"), "ครีเอเตอร์ได้รับ = ลูกค้าเป็นคนยกเลิก");
    assert.ok(toCreator.body.includes(th.cancelledMoneyCreator));
    assert.ok(toCreator.body.includes(formatMoney(55_000, "THB", "th")));

    // แจ้งโอนค้างไว้ ยังไม่มีใครยืนยัน = ยังนับว่ามีเงินเกี่ยวข้อง แต่ไม่พูดว่า "ยืนยันแล้ว ฿0"
    const pending = render("order_cancelled", client(order({ moneyMoved: true })));
    assert.ok(pending.body.includes(th.cancelledMoneyClient));
    assert.equal(pending.body.includes(formatMoney(0, "THB", "th")), false, pending.body);
  });

  it("ลูกค้าปิดงานระหว่างรอบแก้: ถึงครีเอเตอร์เท่านั้น บอกว่าไม่ต้องทำรอบแก้ต่อ และลิงก์ไปหน้าออเดอร์", () => {
    const th = getDictionary("th").email;
    const toCreator = render("order_closed_early", creator(order({ paidCents: 110_000, moneyMoved: true })));
    assert.ok(toCreator.subject.startsWith("Mali"), toCreator.subject);
    assert.ok(toCreator.subject.includes(CODE));
    assert.ok(toCreator.body.includes(th.orderClosedEarlyFiles));
    assert.equal(toCreator.path, `/orders/${CODE}`);
    const wrong = renderEmail({ kind: "order_closed_early", data: {}, facts: client(order()), locale: "th" });
    assert.equal(!wrong.ok && wrong.reason, "wrong_audience");
  });

  it("คำเชิญที่มีคนกดรับ: ชื่อ อีเมลที่กด ยอด และลิงก์ไปหน้าคำเชิญ", () => {
    const r = renderEmail({ kind: "invite_claimed", data: {}, facts: INVITE, locale: "en" });
    assert.ok(r.ok);
    assert.match(r.email.body, /mali@example\.com/);
    assert.ok(r.email.body.includes(formatMoney(250_000, "THB", "en")));
    assert.equal(r.email.path, "/invites");
  });

  it("เตือนปิดงานอัตโนมัติ: บอกจำนวนวัน ชื่องาน และวิธีขอแก้ — ขาดจำนวนวันไม่ส่ง", () => {
    for (const locale of LOCALES) {
      const m = render("auto_complete_soon", client(order({ paidCents: 110_000 })), locale, {
        code: CODE,
        days: 2,
      });
      assert.match(m.subject, /2/);
      assert.match(m.subject, new RegExp(CODE));
      assert.match(m.body, /Bust sketch/);
      assert.ok(m.body.includes(getDictionary(locale).orderAction.requestRevision), m.body);
      assert.equal(m.path, `/my/requests/${CODE}`);
    }
    const noDays = renderEmail({
      kind: "auto_complete_soon",
      data: { code: CODE },
      facts: client(order()),
      locale: "th",
    });
    assert.equal(!noDays.ok && noDays.detail, "days");
    // ครีเอเตอร์ไม่ใช่ผู้รับของอีเมลนี้
    const toCreator = renderEmail({
      kind: "auto_complete_soon",
      data: { code: CODE, days: 2 },
      facts: creator(order()),
      locale: "th",
    });
    assert.equal(!toCreator.ok && toCreator.reason, "wrong_audience");
  });

  it("ภาษาของอีเมลเปลี่ยนตาม locale จริง", () => {
    const th = render("delivery_released", client(order()), "th");
    const en = render("delivery_released", client(order()), "en");
    assert.ok(THAI.test(th.body));
    assert.equal(THAI.test(en.body), false);
    assert.notEqual(th.subject, en.subject);
  });
});

describe("ส่วนประกอบ", () => {
  it("missingKeys ตรวจที่ template — ชื่อร้านที่มีวงเล็บปีกกาไม่นับว่าหลุด", () => {
    assert.deepEqual(missingKeys("{shop} ส่ง {amount}", { shop: "{x}", amount: "" }), ["amount"]);
    assert.deepEqual(missingKeys("ไม่มีช่อง", {}), []);
  });

  it("orderFacts: ชื่อว่างเป็น null, ใบแรกคือใบที่เปิดอยู่, มีเงินเกี่ยวข้องตรงกับ moneyMoved()", () => {
    const base: OrderRow = {
      code: CODE,
      currency: "THB",
      totalCents: 100_000,
      depositCents: 0,
      amountPaidCents: 0,
      client: { name: "  " },
      page: { displayName: " Shop " },
      service: null,
      payments: [],
      quotes: [],
    };
    const f = orderFacts(base);
    assert.equal(f.clientName, null);
    assert.equal(f.shopName, "Shop");
    assert.equal(f.service, null);
    assert.equal(f.moneyMoved, false);
    assert.equal(f.liveQuote, null);

    const rejected = orderFacts({
      ...base,
      payments: [{ amountCents: 500, verifiedAt: null, rejectedAt: new Date(), voidedAt: null }],
      quotes: [{ totalCents: 9, depositCents: 1 }],
    });
    assert.equal(rejected.moneyMoved, true, "ถูกตอบว่ายังไม่ได้รับ ก็ยังนับว่ามีเงินเกี่ยวข้อง");
    assert.deepEqual(rejected.liveQuote, { totalCents: 9, depositCents: 1 });
  });

  it("ลิงก์ตามฝั่งผู้รับ", () => {
    assert.equal(emailPath({ entity: "order", role: "client", order: order() }), `/my/requests/${CODE}`);
    assert.equal(emailPath({ entity: "order", role: "creator", order: order() }), `/orders/${CODE}`);
    assert.equal(emailPath(INVITE), "/invites");
  });

  it("Accept-Language → locale", () => {
    assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9,th;q=0.8"), "en");
    assert.equal(localeFromAcceptLanguage("th-TH,th;q=0.9"), "th");
    assert.equal(localeFromAcceptLanguage("ja-JP,fr;q=0.5"), null);
    assert.equal(localeFromAcceptLanguage(""), null);
    assert.equal(localeFromAcceptLanguage(null), null);
  });
});

describe("ผู้เรียก notify() ส่งชนิดที่ถูกฝั่ง", () => {
  const read = (p: string) => readFileSync(join(import.meta.dirname, "..", "..", p), "utf8");

  it("ยืนยันคำเชิญแจ้งลูกค้าด้วย invite_confirmed ไม่ใช่ order_created", () => {
    const src = read("lib/orders/invite.ts");
    assert.match(src, /type: "invite_confirmed"/);
    assert.equal(src.includes('type: "order_created"'), false);
  });

  it("order_created (ถึงครีเอเตอร์) มีที่เดียวคือตอนลูกค้าสั่งจากเมนู", () => {
    for (const p of [
      "lib/orders/actions.ts",
      "lib/orders/quote.ts",
      "lib/orders/invite.ts",
      "lib/payments/actions.ts",
      "lib/delivery/actions.ts",
    ]) {
      assert.equal(read(p).includes('type: "order_created"'), false, p);
    }
    assert.match(read("lib/orders/create.ts"), /type: "order_created"/);
  });
});
