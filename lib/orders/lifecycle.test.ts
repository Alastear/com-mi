import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTO_COMPLETE_MS,
  AUTO_COMPLETE_NOTICE_DAYS,
  AUTO_COMPLETE_NOTICE_MS,
  AUTO_COMPLETE_WARN_MS,
  CRON_JITTER_MS,
  DAY_MS,
  QUOTE_GRACE_MS,
  REQUEST_TTL_MS,
  decideLifecycle,
  deliveredAnchor,
  depositJustMet,
  dueAfterDeposit,
  dueState,
  isOverdue,
  type DueOrder,
  type LifecycleDecision,
  type LifecycleOrder,
} from "./lifecycle";
import { canTransition } from "./state-machine";
import { dueLabel, eventText } from "./labels";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

/**
 * กติกาของ cron วงจรชีวิตออเดอร์ — ทุกข้อในนี้คือสิ่งที่ถ้าพลาดแล้วเกิดกับออเดอร์ของคนจริง
 * โดยไม่มีใครกดอะไรเลย (ปิดงานทับเรื่องที่ลูกค้ากำลังร้องเรียน, หมดอายุคำขอที่ครีเอเตอร์กำลังคุยอยู่)
 */

const HOUR = 3_600_000;
const T0 = new Date("2026-09-01T12:00:00Z").getTime();
const at = (ms: number) => new Date(T0 + ms);

function order(over: Partial<LifecycleOrder> = {}): LifecycleOrder {
  return {
    status: "requested",
    updatedAt: at(0),
    lastCreatorMessageAt: null,
    lastClientMessageAt: null,
    liveQuoteExpiresAt: null,
    totalCents: 100_000,
    amountPaidCents: 0,
    hasPendingPayment: false,
    autoCompleteWarnedAt: null,
    ...over,
  };
}

/** งานที่ส่งแล้วและจ่ายครบ — ต้นแบบของกติกาปิดงาน */
const delivered = (over: Partial<LifecycleOrder> = {}) =>
  order({ status: "delivered", amountPaidCents: 100_000, ...over });

const decide = (o: LifecycleOrder, nowMs: number) => decideLifecycle(o, at(nowMs)).kind;

describe("ค่าคงที่ของกติกา", () => {
  it("เตือนก่อนปิด 2 วัน และจำนวนวันที่บอกลูกค้ามาจากค่าคงที่", () => {
    assert.equal(AUTO_COMPLETE_WARN_MS, 5 * DAY_MS);
    assert.equal(AUTO_COMPLETE_MS, 7 * DAY_MS);
    assert.equal(AUTO_COMPLETE_NOTICE_MS, 2 * DAY_MS);
    assert.equal(AUTO_COMPLETE_NOTICE_DAYS, 2);
    assert.equal(REQUEST_TTL_MS, 14 * DAY_MS);
    assert.equal(QUOTE_GRACE_MS, 3 * DAY_MS);
  });

  it("ค่าเผื่อ cron คลาดต้องเล็กกว่าระยะเตือนมาก ไม่งั้นเตือนแล้วปิดในรอบถัดไปทันที", () => {
    assert.ok(CRON_JITTER_MS * 12 <= AUTO_COMPLETE_NOTICE_MS);
  });
});

describe("คำขอที่ครีเอเตอร์ไม่แตะ (requested → expired)", () => {
  it("ครบ 14 วันพอดี = หมดอายุ ขาดไป 1 ms = ยัง", () => {
    assert.equal(decide(order(), REQUEST_TTL_MS), "expire");
    assert.equal(decide(order(), REQUEST_TTL_MS - 1), "none");
  });

  it("ครีเอเตอร์พิมพ์ในเธรด = เริ่มนับใหม่จากข้อความนั้น", () => {
    const o = order({ lastCreatorMessageAt: at(10 * DAY_MS) });
    assert.equal(decide(o, 20 * DAY_MS), "none");
    assert.equal(decide(o, 24 * DAY_MS), "expire");
  });

  it("ข้อความของลูกค้าไม่ยื้อ — ครีเอเตอร์ที่ไม่ตอบเลย คำขอก็ต้องหมดอายุ", () => {
    const o = order({ lastClientMessageAt: at(13 * DAY_MS) });
    assert.equal(decide(o, REQUEST_TTL_MS), "expire");
  });

  it("บอกว่าเปลี่ยนจาก requested ซึ่ง state machine ให้ system ทำได้", () => {
    const d = decideLifecycle(order(), at(REQUEST_TTL_MS));
    assert.deepEqual(d, { kind: "expire", from: "requested" });
    assert.ok(canTransition("requested", "expired", "system"));
  });
});

describe("ใบเสนอราคาหมดอายุแล้วไม่มีใครทำอะไร (quoted → expired)", () => {
  const quoted = (over: Partial<LifecycleOrder> = {}) =>
    order({ status: "quoted", liveQuoteExpiresAt: at(14 * DAY_MS), ...over });

  it("หมดอายุแล้ว 3 วันพอดี = หมดอายุ ขาดไป 1 ms = ยัง", () => {
    assert.equal(decide(quoted(), 17 * DAY_MS), "expire");
    assert.equal(decide(quoted(), 17 * DAY_MS - 1), "none");
  });

  it("ใบยังไม่หมดอายุ ต่อให้ออเดอร์เก่าแค่ไหนก็ไม่ปิด", () => {
    const o = quoted({ liveQuoteExpiresAt: at(100 * DAY_MS) });
    assert.equal(decide(o, 99 * DAY_MS), "none");
  });

  it("ใบที่ไม่มีวันหมดอายุ หรือไม่มีใบเปิดอยู่ = ไม่เข้ากติกานี้เลย", () => {
    assert.equal(decide(quoted({ liveQuoteExpiresAt: null }), 365 * DAY_MS), "none");
  });

  it("ข้อความของใครก็ได้หลังใบหมดอายุ = ยังคุยกันอยู่ เริ่มนับ 3 วันใหม่", () => {
    for (const key of ["lastClientMessageAt", "lastCreatorMessageAt"] as const) {
      const o = quoted({ [key]: at(16 * DAY_MS) });
      assert.equal(decide(o, 18 * DAY_MS), "none", key);
      assert.equal(decide(o, 19 * DAY_MS), "expire", key);
    }
  });

  it("ข้อความก่อนใบหมดอายุไม่ยื้อ — จุดเริ่มนับคือวันหมดอายุ", () => {
    const o = quoted({ lastClientMessageAt: at(13 * DAY_MS) });
    assert.equal(decide(o, 17 * DAY_MS), "expire");
  });

  it("state machine ให้ system ทำได้", () => {
    assert.deepEqual(decideLifecycle(quoted(), at(17 * DAY_MS)), { kind: "expire", from: "quoted" });
    assert.ok(canTransition("quoted", "expired", "system"));
  });
});

describe("ส่งงานแล้ว → เตือนวันที่ 5 → ปิดวันที่ 7 (delivered → completed)", () => {
  it("วันที่ 5 พอดีเตือน ก่อนนั้นไม่ทำอะไร", () => {
    assert.equal(decide(delivered(), AUTO_COMPLETE_WARN_MS - 1), "none");
    assert.equal(decide(delivered(), AUTO_COMPLETE_WARN_MS), "warn_auto_complete");
  });

  it("ไม่เคยเตือน = ไม่ปิด ต่อให้ผ่านไป 30 วัน (cron ล่มหลายวัน) — เตือนก่อนเสมอ", () => {
    assert.equal(decide(delivered(), 30 * DAY_MS), "warn_auto_complete");
  });

  it("เตือนวันที่ 5 แล้ว: วันที่ 7 ปิด ก่อนนั้นไม่ปิด", () => {
    const o = delivered({ autoCompleteWarnedAt: at(5 * DAY_MS) });
    assert.equal(decide(o, 6 * DAY_MS), "none");
    assert.equal(decide(o, 7 * DAY_MS - CRON_JITTER_MS - 1), "none");
    assert.equal(decide(o, 7 * DAY_MS), "auto_complete");
  });

  it("เตือนช้า (วันที่ 6) ต้องรอครบ 2 วันจากคำเตือน ไม่ใช่ปิดวันที่ 7", () => {
    const o = delivered({ autoCompleteWarnedAt: at(6 * DAY_MS) });
    assert.equal(decide(o, 7 * DAY_MS), "none");
    assert.equal(decide(o, 8 * DAY_MS - CRON_JITTER_MS), "auto_complete");
  });

  it("cron ตื่นเร็วกว่ารอบที่เตือนไม่กี่นาที ยังปิดตามที่บอกลูกค้าไว้ ไม่เลื่อนไปอีกวัน", () => {
    const o = delivered({ autoCompleteWarnedAt: at(5 * DAY_MS + 5 * 60_000) });
    assert.equal(decide(o, 7 * DAY_MS + 60_000), "auto_complete");
  });

  it("จ่ายไม่ครบ (ยกเลิกการยืนยันทีหลัง) = ไม่เตือน ไม่ปิด", () => {
    const o = delivered({ amountPaidCents: 50_000, autoCompleteWarnedAt: at(5 * DAY_MS) });
    assert.equal(decide(o, 5 * DAY_MS), "none");
    assert.equal(decide(o, 30 * DAY_MS), "none");
    assert.equal(decide(delivered({ amountPaidCents: 50_000 }), 30 * DAY_MS), "none");
  });

  it("ราคา ฿0 ไม่นับว่าจ่ายครบ (ด่านเดียวกับ canRelease)", () => {
    assert.equal(decide(delivered({ totalCents: 0, amountPaidCents: 0 }), 30 * DAY_MS), "none");
  });

  it("มีรายการแจ้งโอนรอครีเอเตอร์ตอบ = ไม่เตือน ไม่ปิด", () => {
    const o = delivered({ hasPendingPayment: true, autoCompleteWarnedAt: at(5 * DAY_MS) });
    assert.equal(decide(o, 10 * DAY_MS), "none");
    assert.equal(decide(delivered({ hasPendingPayment: true }), 10 * DAY_MS), "none");
  });

  it("ลูกค้าทักมาหลังคำเตือน = คำเตือนเดิมใช้ไม่ได้ เริ่มนับใหม่ เตือนใหม่วันที่ 5 ของรอบใหม่", () => {
    const o = delivered({
      autoCompleteWarnedAt: at(5 * DAY_MS),
      lastClientMessageAt: at(6 * DAY_MS),
    });
    assert.equal(deliveredAnchor(o).getTime(), T0 + 6 * DAY_MS);
    assert.equal(decide(o, 7 * DAY_MS), "none", "ห้ามปิดทับเรื่องที่ลูกค้าเพิ่งทัก");
    assert.equal(decide(o, 11 * DAY_MS - 1), "none");
    assert.equal(decide(o, 11 * DAY_MS), "warn_auto_complete");
  });

  it("ข้อความของครีเอเตอร์ไม่ยื้องานของตัวเอง", () => {
    const o = delivered({
      autoCompleteWarnedAt: at(5 * DAY_MS),
      lastCreatorMessageAt: at(6 * DAY_MS),
    });
    assert.equal(decide(o, 7 * DAY_MS), "auto_complete");
  });

  it("ส่งงานรอบใหม่/เงินขยับ (updatedAt ใหม่กว่าคำเตือน) = คำเตือนเก่าใช้ไม่ได้", () => {
    const o = delivered({ updatedAt: at(8 * DAY_MS), autoCompleteWarnedAt: at(5 * DAY_MS) });
    assert.equal(decide(o, 10 * DAY_MS), "none");
    assert.equal(decide(o, 13 * DAY_MS), "warn_auto_complete");
  });

  it("state machine ให้ system ปิดงานได้", () => {
    assert.ok(canTransition("delivered", "completed", "system"));
  });
});

describe("สถานะอื่นไม่ถูกแตะ ไม่ว่าเก่าแค่ไหน", () => {
  const untouched = ORDER_STATUSES.filter(
    (s) => !(["requested", "quoted", "delivered"] as OrderStatus[]).includes(s),
  );
  it("reviewing / accepted / in_progress / … / สถานะปลายทาง", () => {
    for (const status of untouched) {
      const o = order({
        status,
        amountPaidCents: 100_000,
        liveQuoteExpiresAt: at(0),
        autoCompleteWarnedAt: at(0),
      });
      assert.equal(decide(o, 365 * DAY_MS), "none", status);
    }
  });
});

/* ── สุ่มแบบกำหนด seed — ตรวจ "ข้อที่ต้องจริงเสมอ" ข้ามกรณีจำนวนมาก ────────── */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCase(r: () => number): { o: LifecycleOrder; now: number } {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const maybe = (ms: number) => (r() < 0.4 ? null : at(Math.floor(r() * ms)));
  const total = pick([0, 100_000, 250_000]);
  return {
    o: order({
      status: pick(ORDER_STATUSES),
      updatedAt: at(Math.floor(r() * 20 * DAY_MS)),
      lastCreatorMessageAt: maybe(25 * DAY_MS),
      lastClientMessageAt: maybe(25 * DAY_MS),
      liveQuoteExpiresAt: maybe(25 * DAY_MS),
      totalCents: total,
      amountPaidCents: pick([0, total / 2, total]),
      hasPendingPayment: r() < 0.2,
      autoCompleteWarnedAt: maybe(25 * DAY_MS),
    }),
    now: Math.floor(r() * 40 * DAY_MS),
  };
}

describe("ข้อที่ต้องจริงเสมอ (สุ่ม 20,000 กรณี)", () => {
  const r = rng(20260928);
  const cases = Array.from({ length: 20_000 }, () => randomCase(r));
  const kinds = new Set<string>();

  it("ทุกการตัดสินเป็นเส้นที่ state machine ให้ system เดินได้", () => {
    for (const { o, now } of cases) {
      const d = decideLifecycle(o, at(now));
      kinds.add(d.kind);
      if (d.kind === "expire") assert.ok(canTransition(d.from, "expired", "system"));
      if (d.kind === "auto_complete") assert.ok(canTransition(o.status, "completed", "system"));
      if (d.kind === "warn_auto_complete") assert.equal(o.status, "delivered");
    }
    // ชุดสุ่มต้องครอบทุกผลจริง ไม่งั้นข้ออื่นในนี้ผ่านเพราะไม่เคยเจอกรณีนั้น
    assert.deepEqual([...kinds].sort(), ["auto_complete", "expire", "none", "warn_auto_complete"]);
  });

  it("ปิดงาน = จ่ายครบ ไม่มีแจ้งโอนค้าง เตือนในรอบนี้แล้ว ≥ 2 วัน (หักค่าคลาด) และส่งมาแล้ว ≥ 7 วัน", () => {
    for (const { o, now } of cases) {
      if (decideLifecycle(o, at(now)).kind !== "auto_complete") continue;
      const anchor = deliveredAnchor(o).getTime();
      const warned = o.autoCompleteWarnedAt!.getTime();
      assert.ok(o.totalCents > 0 && o.amountPaidCents >= o.totalCents);
      assert.equal(o.hasPendingPayment, false);
      assert.ok(warned >= anchor, "คำเตือนต้องเป็นของรอบนี้");
      assert.ok(T0 + now - warned >= AUTO_COMPLETE_NOTICE_MS - CRON_JITTER_MS);
      assert.ok(T0 + now - anchor >= AUTO_COMPLETE_MS);
    }
  });

  it("ข้อความของลูกค้าไม่เปลี่ยนผลของคำขอ และข้อความของครีเอเตอร์ไม่เปลี่ยนผลของงานที่ส่งแล้ว", () => {
    for (const { o, now } of cases) {
      const base = decideLifecycle(o, at(now));
      if (o.status === "requested") {
        const noisy = { ...o, lastClientMessageAt: at(now) };
        assert.deepEqual(decideLifecycle(noisy, at(now)), base);
      }
      if (o.status === "delivered") {
        const noisy = { ...o, lastCreatorMessageAt: at(now) };
        assert.deepEqual(decideLifecycle(noisy, at(now)), base);
      }
    }
  });

  it("รันซ้ำทันทีหลังลงมือ = ไม่มีอะไรให้ทำอีก (cron ยิงซ้ำไม่เตือนซ้ำ ไม่ย้ายซ้ำ)", () => {
    for (const { o, now } of cases) {
      const d = decideLifecycle(o, at(now));
      const after = applied(o, d, now);
      if (after) assert.equal(decideLifecycle(after, at(now)).kind, "none", `${o.status} ${d.kind}`);
    }
  });

  it("ข้อความใหม่ของคนที่เกี่ยวข้อง ณ ตอนนี้ ไม่มีทางทำให้เกิดการย้าย/ปิดในรอบเดียวกัน", () => {
    for (const { o, now } of cases) {
      const key =
        o.status === "requested"
          ? "lastCreatorMessageAt"
          : o.status === "delivered"
            ? "lastClientMessageAt"
            : "lastClientMessageAt";
      const d = decideLifecycle({ ...o, [key]: at(now) }, at(now));
      assert.ok(d.kind === "none", `${o.status} → ${d.kind}`);
    }
  });
});

/** ผลของการลงมือตามที่ cron เขียนจริง — เตือนไม่แตะ updatedAt, ย้ายสถานะแตะ */
function applied(o: LifecycleOrder, d: LifecycleDecision, now: number): LifecycleOrder | null {
  switch (d.kind) {
    case "none":
      return null;
    case "warn_auto_complete":
      return { ...o, autoCompleteWarnedAt: at(now) };
    case "expire":
      return { ...o, status: "expired", updatedAt: at(now) };
    case "auto_complete":
      return { ...o, status: "completed", updatedAt: at(now) };
  }
}

describe("จำลอง cron รายวันตอน 19:00 UTC", () => {
  /** รัน cron วันละครั้งตั้งแต่วันที่ส่งงาน แล้วคืนว่าเตือน/ปิดวันไหน (นับจากวันส่ง) */
  function simulate(
    start: LifecycleOrder,
    deliveredAtMs: number,
    events: Array<{ atMs: number; apply: (o: LifecycleOrder) => LifecycleOrder }> = [],
  ) {
    let o = start;
    const log: Array<{ day: number; kind: string }> = [];
    const firstRun = Math.ceil((deliveredAtMs - 7 * HOUR) / DAY_MS) * DAY_MS + 7 * HOUR; // 19:00 UTC
    for (let run = firstRun; run < deliveredAtMs + 30 * DAY_MS; run += DAY_MS) {
      for (const e of events) if (e.atMs <= run && e.atMs > run - DAY_MS) o = e.apply(o);
      // cron ตื่นคลาดไปมาไม่กี่นาที
      const now = run + ((run / DAY_MS) % 2 === 0 ? -3 : 4) * 60_000;
      const d = decideLifecycle(o, at(now));
      if (d.kind !== "none") log.push({ day: (now - deliveredAtMs) / DAY_MS, kind: d.kind });
      o = applied(o, d, now) ?? o;
      if (o.status === "completed") break;
    }
    return log;
  }

  it("เตือนครั้งเดียว แล้วปิด 2 วันหลังจากนั้นพอดี ไม่ก่อนวันที่ 7", () => {
    for (const hour of [0, 6, 12, 18.99, 19.01, 23]) {
      const deliveredAt = hour * HOUR;
      const log = simulate(delivered({ updatedAt: at(deliveredAt) }), deliveredAt);
      assert.equal(log.length, 2, `${hour}h: ${JSON.stringify(log)}`);
      const [warn, done] = log;
      assert.equal(warn.kind, "warn_auto_complete");
      assert.equal(done.kind, "auto_complete");
      assert.ok(warn.day >= 5 && warn.day < 6.1, `${hour}h เตือนวันที่ ${warn.day}`);
      assert.ok(done.day >= 7, `${hour}h ปิดวันที่ ${done.day}`);
      assert.ok(Math.abs(done.day - warn.day - 2) < 0.01, `${hour}h ห่างกัน ${done.day - warn.day} วัน`);
    }
  });

  it("ลูกค้าทักวันที่ 6 (หลังได้คำเตือน) = เตือนใหม่อีกรอบ แล้วค่อยปิด", () => {
    const log = simulate(delivered(), 0, [
      { atMs: 6 * DAY_MS, apply: (o) => ({ ...o, lastClientMessageAt: at(6 * DAY_MS) }) },
    ]);
    assert.deepEqual(
      log.map((l) => l.kind),
      ["warn_auto_complete", "warn_auto_complete", "auto_complete"],
    );
    assert.ok(log[2].day >= 13, `ปิดวันที่ ${log[2].day} — ต้องนับ 7 วันจากข้อความ`);
  });

  it("ครีเอเตอร์ยกเลิกการยืนยันระหว่างทาง = ไม่ปิดจนกว่าจะจ่ายครบ และเตือนใหม่ก่อนปิด", () => {
    const log = simulate(delivered(), 0, [
      { atMs: 6 * DAY_MS, apply: (o) => ({ ...o, amountPaidCents: 50_000, updatedAt: at(6 * DAY_MS) }) },
      { atMs: 10 * DAY_MS, apply: (o) => ({ ...o, amountPaidCents: 100_000, updatedAt: at(10 * DAY_MS) }) },
    ]);
    assert.deepEqual(
      log.map((l) => l.kind),
      ["warn_auto_complete", "warn_auto_complete", "auto_complete"],
    );
    assert.ok(log[2].day >= 17);
  });
});

describe("มัดจำครบ = เริ่มนับกำหนดส่ง (ต้องตรงกับ SQL ใน recomputePaid)", () => {
  const base = { depositCents: 50_000, depositMetAt: null, oldPaidCents: 0, newPaidCents: 50_000 };

  it("ข้ามเส้นมัดจำครั้งแรก = ใช่", () => {
    assert.equal(depositJustMet(base), true);
    assert.equal(depositJustMet({ ...base, newPaidCents: 100_000 }), true, "จ่ายเต็มทีเดียวก็นับ");
    assert.equal(depositJustMet({ ...base, oldPaidCents: 20_000 }), true, "จ่ายสองงวดจนครบ");
  });

  it("ไม่ข้ามเส้น / ข้ามไปแล้วก่อนหน้า / เคยครบแล้ว / ไม่มีมัดจำ = ไม่ใช่", () => {
    assert.equal(depositJustMet({ ...base, newPaidCents: 49_900 }), false);
    assert.equal(depositJustMet({ ...base, oldPaidCents: 50_000, newPaidCents: 100_000 }), false,
      "ออเดอร์ที่มัดจำครบก่อนมีระบบนี้ ห้ามเลื่อนตอนจ่ายงวดสุดท้าย");
    assert.equal(depositJustMet({ ...base, depositMetAt: new Date() }), false,
      "ยกเลิกการยืนยันแล้วยืนยันใหม่ ห้ามเลื่อนซ้ำ");
    assert.equal(depositJustMet({ ...base, depositCents: 0, newPaidCents: 10_000 }), false);
    assert.equal(depositJustMet({ ...base, oldPaidCents: 50_000, newPaidCents: 0 }), false, "ยอดลดลง");
  });

  it("กำหนดส่งใหม่ = ตอนมัดจำครบ + ระยะเวลาที่ตกลงไว้บนออเดอร์ (ไม่ใช่จากเมนูปัจจุบัน)", () => {
    const createdAt = at(0);
    const dueAt = at(7 * DAY_MS);
    const met = at(10 * DAY_MS + 5 * HOUR);
    assert.equal(dueAfterDeposit({ dueAt, createdAt }, met)!.getTime(), met.getTime() + 7 * DAY_MS);
    assert.equal(dueAfterDeposit({ dueAt: null, createdAt }, met), null);
  });
});

describe("เลยกำหนด (คำนวณตอนแสดง)", () => {
  const now = at(10 * DAY_MS);
  const due = (over: Partial<DueOrder> = {}): DueOrder => ({
    status: "in_progress",
    dueAt: at(7 * DAY_MS),
    createdAt: at(0),
    depositCents: 0,
    amountPaidCents: 0,
    depositMetAt: null,
    ...over,
  });

  it("งานที่ยังอยู่ในมือครีเอเตอร์และเลยวันกำหนด = เลยกำหนด", () => {
    for (const status of [
      "requested",
      "reviewing",
      "quoted",
      "accepted",
      "in_progress",
      "in_review",
      "revision_requested",
    ] as const) {
      assert.equal(isOverdue(due({ status }), now), true, status);
    }
  });

  it("ส่งแล้ว / เสร็จ / ปิดไปแล้ว ไม่ขึ้นเลยกำหนด และไม่มีป้ายเลย", () => {
    for (const status of ["delivered", "completed", "cancelled", "declined", "expired"] as const) {
      assert.equal(isOverdue(due({ status }), now), false, status);
      assert.deepEqual(dueState(due({ status }), now), { kind: "none" }, status);
    }
  });

  it("ยังไม่ถึงกำหนด (แม้แค่ 1 ms) = ไม่เลย / ไม่มีกำหนด = ไม่มีป้าย", () => {
    assert.equal(isOverdue(due({ dueAt: at(10 * DAY_MS + 1) }), now), false);
    assert.equal(isOverdue(due({ dueAt: at(10 * DAY_MS - 1) }), now), true);
    assert.deepEqual(dueState(due({ dueAt: null }), now), { kind: "none" });
  });

  it("รอมัดจำอยู่ = ยังไม่เริ่มนับ ไม่ใช่เลยกำหนด — และบอกจำนวนวันที่ตกลงไว้", () => {
    const waiting = due({ status: "accepted", depositCents: 50_000 });
    assert.equal(isOverdue(waiting, now), false);
    assert.deepEqual(dueState(waiting, now), { kind: "after_deposit", days: 7 });
  });

  it("มัดจำครบแล้ว (หรือครบก่อนมีระบบนี้) = นับตามปกติ", () => {
    assert.equal(isOverdue(due({ depositCents: 50_000, amountPaidCents: 50_000 }), now), true,
      "ออเดอร์เก่าที่ depositMetAt เป็น null แต่จ่ายครบแล้ว");
    assert.equal(
      isOverdue(due({ depositCents: 50_000, amountPaidCents: 0, depositMetAt: at(1 * DAY_MS) }), now),
      true,
      "เคยครบแล้วโดนยกเลิกการยืนยันทีหลัง — นาฬิกาเดินไปแล้ว ไม่หยุดย้อนหลัง",
    );
  });

  it("รับวันที่เป็น ISO string ได้ (DTO ที่ข้ามไปฝั่ง client)", () => {
    const o = due({ dueAt: at(7 * DAY_MS).toISOString(), createdAt: at(0).toISOString() });
    assert.equal(isOverdue(o, now), true);
  });
});

describe("ป้ายกำหนดส่ง (บอร์ด + สองหน้างาน)", () => {
  const th = getDictionary("th");
  const en = getDictionary("en");
  // เที่ยง UTC ห่างกันเป็นวันเต็ม — นับวันปฏิทินได้เลขเดียวกันทุก timezone ตั้งแต่ −11 ถึง +11
  const now = at(10 * DAY_MS);
  const base: DueOrder = {
    status: "in_progress",
    dueAt: at(7 * DAY_MS),
    createdAt: at(0),
    depositCents: 0,
    amountPaidCents: 0,
    depositMetAt: null,
  };

  it("เลยกำหนด 3 วัน = 'เลยกำหนด 3 วัน' สีแดง", () => {
    assert.deepEqual(dueLabel(th, base, now), { kind: "overdue", text: "เลยกำหนด 3 วัน", tone: "overdue" });
    assert.equal(dueLabel(en, base, now)!.text, "Overdue 3d");
  });

  it("ยังไม่ถึงกำหนด: เหลือกี่วัน / ใกล้แล้วเป็นสีเตือน / วันนี้", () => {
    assert.deepEqual(dueLabel(th, { ...base, dueAt: at(15 * DAY_MS) }, now), {
      kind: "running",
      text: "อีก 5 วัน",
      tone: "normal",
    });
    assert.equal(dueLabel(th, { ...base, dueAt: at(12 * DAY_MS) }, now)!.tone, "soon");
    assert.equal(dueLabel(th, { ...base, dueAt: at(10 * DAY_MS + HOUR) }, now)!.text, th.order.dueToday);
  });

  it("รอมัดจำ = บอกเป็นจำนวนวันหลังได้มัดจำ ไม่ใช่เลยกำหนด", () => {
    const l = dueLabel(th, { ...base, status: "accepted", depositCents: 50_000 }, now)!;
    assert.equal(l.kind, "after_deposit");
    assert.equal(l.tone, "normal");
    assert.match(l.text, /7/);
  });

  it("ส่งงานแล้ว = ไม่มีป้าย (เดิมขึ้น 'เลย N วัน' แดงบนการ์ดที่ส่งไปแล้ว)", () => {
    assert.equal(dueLabel(th, { ...base, status: "delivered" }, now), null);
  });
});

describe("event ของระบบบน timeline", () => {
  const th = getDictionary("th");
  const en = getDictionary("en");

  it("มัดจำครบ: บอกกำหนดส่งใหม่จาก event ไม่เดาถ้าไม่มี — ทั้งสองภาษา", () => {
    for (const [locale, t] of [["th", th], ["en", en]] as const) {
      const withDate = eventText(t, "deposit_met", { actor: "system", due: "2026-10-05T12:00:00.000+00:00" }, locale)!;
      assert.match(withDate, /2026|2569/);
      assert.equal(/\{\w+\}/.test(withDate), false);
      const noDate = eventText(t, "deposit_met", { actor: "system" }, locale)!;
      assert.equal(noDate, t.orderEvent.deposit_met);
    }
  });

  it("เตือนปิดงาน: บอกจำนวนวัน — ไม่มีจำนวนวัน = ไม่แสดง", () => {
    for (const [locale, t] of [["th", th], ["en", en]] as const) {
      const text = eventText(t, "auto_complete_warned", { actor: "system", days: 2 }, locale)!;
      assert.match(text, /2/);
      assert.equal(/\{\w+\}/.test(text), false);
      assert.equal(eventText(t, "auto_complete_warned", { actor: "system" }, locale), null);
    }
  });
});

describe("ด่านใน SQL ที่เทสต์นี้รันไม่ถึง (ต้องมี DB) — ตรวจที่ตัวโค้ด", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const run = read("lib/orders/lifecycle-run.ts");
  const pay = read("lib/payments/actions.ts");

  it("ทุกการเขียนของ cron มี 'ยังเหมือนตอนที่อ่าน' และล็อกแถวออเดอร์ก่อน", () => {
    assert.equal((run.match(/\$\{unchangedSql\(c\)\}/g) ?? []).length, 2, "moveBySystem + warnAutoComplete");
    assert.equal((run.match(/lockOrder\(c\.id\)/g) ?? []).length, 2);
  });

  it("ปิดงานมีด่านจ่ายครบ + ไม่มีแจ้งโอนค้าง + คำเตือนใบเดิม อยู่ใน WHERE", () => {
    const guards = run.slice(run.indexOf("function completeGuards"));
    assert.match(guards, /moneyGateSql\("delivered"\)/);
    assert.match(guards, /r\.verified_at is null and r\.rejected_at is null/);
    assert.match(guards, /autoCompleteWarnedAt\} = \$\{c\.warned_raw\}/);
  });

  it("เตือนไม่แตะ updated_at (จุดเริ่มนับของการปิด) — ถ้าแตะ งานจะไม่มีวันถูกปิด", () => {
    const warn = run.slice(run.indexOf("async function warnAutoComplete"), run.indexOf("/* ── ตัวเรียกหลัก"));
    assert.match(warn, /set auto_complete_warned_at = /);
    assert.equal(/updated_at\s*=/.test(warn.replace(/\$\{o\.updatedAt\} = /g, "")), false);
  });

  it("การย้ายสถานะผ่าน assertTransition ของ system เสมอ", () => {
    assert.match(run, /assertTransition\(from, to, "system"\)/);
  });

  it("เลื่อนกำหนดส่งตอนมัดจำครบอยู่ใน UPDATE เดียวกับยอดเงิน และเช็ค 'ข้ามเส้น' + 'ครั้งเดียว'", () => {
    const fn = pay.slice(pay.indexOf("function recomputePaid"), pay.indexOf("function insertDepositMetEvent"));
    assert.match(fn, /depositMetAt\} is null/);
    assert.match(fn, /amountPaidCents\} < \$\{o\.depositCents\}/);
    assert.match(fn, /\$\{paid\} >= \$\{o\.depositCents\}/);
    assert.match(fn, /dueAt: sql`case when \$\{justMet\}/);
    // event มัดจำครบต่อท้ายเฉพาะทางที่ยอดเพิ่มได้ (แจ้ง/บันทึก + ยืนยัน)
    assert.equal((pay.match(/insertDepositMetEvent\(order\.id, now\)/g) ?? []).length, 2);
  });
});
