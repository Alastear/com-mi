import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  onTimePercent,
  roundRating,
  summarizeTrackRecord,
  TRACK_RECORD_MIN_COMPLETED,
  turnaroundFrom,
  type TrackRecordRaw,
} from "./track-record";
import {
  canEditReview,
  paidOnce,
  repliedBeforeEdit,
  REVIEW_EDIT_DAYS,
  reviewEditableUntil,
  reviewEligibility,
  reviewerInitial,
} from "./review-rules";
import { formatYearMonth } from "@/lib/format";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * ประวัติร้านกับรีวิว — ตัวเลขที่ลูกค้าใช้ตัดสินใจโอนเงินให้คนแปลกหน้า
 * ถ้าชุดนี้พัง หน้าร้านจะโชว์คะแนนจากออเดอร์ที่ไม่มีเงินเข้า หรือปัดตัวเลขเข้าข้างร้าน
 */

const DAY = 86_400;

function raw(over: Partial<TrackRecordRaw> = {}): TrackRecordRaw {
  return {
    completed: 6,
    timed: 6,
    onTime: 5,
    medianSeconds: 4 * DAY,
    creatorCancelled: 1,
    reviewCount: 1,
    ratingAvg: 4,
    ...over,
  };
}

describe("ประวัติร้าน — เกณฑ์ขั้นต่ำ", () => {
  it(`ต่ำกว่า ${TRACK_RECORD_MIN_COMPLETED} งานเสร็จ = ร้านใหม่ ไม่มีตัวเลขหลุดออกไป`, () => {
    for (let n = 0; n < TRACK_RECORD_MIN_COMPLETED; n++) {
      const r = summarizeTrackRecord(raw({ completed: n, timed: n, onTime: 0 }));
      assert.equal(r.locked, true, `${n} งานต้องยังล็อก`);
      // ร้านใหม่ต้องไม่มีฟิลด์คะแนนให้หน้าจอเผลอหยิบไปโชว์
      assert.equal("onTimePercent" in r, false);
      assert.equal("rating" in r, false);
      assert.equal("creatorCancelled" in r, false);
    }
  });

  it("ครบเกณฑ์พอดีแล้วปลดล็อก", () => {
    const r = summarizeTrackRecord(raw({ completed: TRACK_RECORD_MIN_COMPLETED }));
    assert.equal(r.locked, false);
  });

  it("ค่าที่ fixture ในเบราว์เซอร์ต้องได้: 6 งาน ตรงเวลา 5/6 = 83% ร้านยกเลิก 1", () => {
    const r = summarizeTrackRecord(raw());
    assert.equal(r.locked, false);
    if (r.locked) return;
    assert.equal(r.completed, 6);
    assert.equal(r.onTimePercent, 83);
    assert.deepEqual(r.turnaround, { kind: "days", days: 4 });
    assert.equal(r.creatorCancelled, 1);
    assert.deepEqual(r.rating, { average: 4, count: 1 });
  });
});

describe("ประวัติร้าน — การปัดไม่เข้าข้างร้าน", () => {
  it("เปอร์เซ็นต์ตรงเวลาปัดลง — 199/200 ต้องไม่ขึ้น 100%", () => {
    assert.equal(onTimePercent(199, 200), 99);
    assert.equal(onTimePercent(200, 200), 100);
    assert.equal(onTimePercent(5, 6), 83);
  });

  it("ไม่มีงานที่มีกำหนดส่งให้เทียบ = null ไม่ใช่ 0% หรือ 100%", () => {
    assert.equal(onTimePercent(0, 0), null);
    const r = summarizeTrackRecord(raw({ timed: 0, onTime: 0 }));
    assert.equal(!r.locked && r.onTimePercent, null);
  });

  it("ตัวเลขเพี้ยนจาก SQL ไม่ทำให้เกิน 100% หรือติดลบ", () => {
    assert.equal(onTimePercent(7, 6), 100);
    assert.equal(onTimePercent(-1, 6), 0);
  });

  it("ค่าเฉลี่ยดาวปัดลง — 4.96 ต้องไม่กลายเป็น 5.0", () => {
    assert.equal(roundRating(4.96), 4.9);
    assert.equal(roundRating(5), 5);
    assert.equal(roundRating(3.33), 3.3);
  });

  it("ยังไม่มีรีวิว = ไม่มีคะแนน ไม่ใช่ 0 ดาว", () => {
    const r = summarizeTrackRecord(raw({ reviewCount: 0, ratingAvg: null }));
    assert.equal(!r.locked && r.rating, null);
  });
});

describe("ประวัติร้าน — เวลาทำงาน", () => {
  it("ไม่ถึงวัน = under_day ไม่ใช่ '0 วัน'", () => {
    assert.deepEqual(turnaroundFrom(3600), { kind: "under_day" });
    assert.deepEqual(turnaroundFrom(0), { kind: "under_day" });
  });

  it("ปัดเป็นวันที่ใกล้ที่สุด", () => {
    assert.deepEqual(turnaroundFrom(1.4 * DAY), { kind: "days", days: 1 });
    assert.deepEqual(turnaroundFrom(1.6 * DAY), { kind: "days", days: 2 });
  });

  it("ไม่มีข้อมูลหรือค่าเพี้ยน = null", () => {
    assert.equal(turnaroundFrom(null), null);
    assert.equal(turnaroundFrom(-5), null);
    assert.equal(turnaroundFrom(Number.NaN), null);
  });
});

describe("รีวิว — ใครรีวิวได้", () => {
  const at = new Date("2026-09-01T00:00:00Z");

  it("งานเสร็จและร้านเคยยืนยันเงินแล้วเท่านั้น", () => {
    assert.equal(reviewEligibility({ status: "completed", paidOnce: true }), "ok");
  });

  it("งานเสร็จแต่ร้านไม่เคยยืนยันเงินเลย = รีวิวไม่ได้", () => {
    assert.equal(reviewEligibility({ status: "completed", paidOnce: false }), "unpaid");
  });

  it("งานที่ยังไม่จบหรือจบแบบไม่ได้งาน รีวิวไม่ได้ แม้จะจ่ายเงินแล้ว", () => {
    for (const status of ["delivered", "in_progress", "cancelled", "declined", "expired"]) {
      assert.equal(reviewEligibility({ status, paidOnce: true }), "not_completed", status);
    }
  });

  it("ร้านยกเลิกการยืนยันทีหลังไม่ได้ทำให้ลูกค้าหมดสิทธิ์รีวิว — แถวที่ void ยังมี verifiedAt", () => {
    // แถวที่ void แล้ว: verifiedAt ยังอยู่ (เก็บไว้เป็นหลักฐาน) — ต้องนับว่าเคยยืนยัน
    assert.equal(paidOnce([{ verifiedAt: at }]), true);
    assert.equal(paidOnce([{ verifiedAt: "2026-09-01T00:00:00Z" }]), true);
    assert.equal(
      reviewEligibility({ status: "completed", paidOnce: paidOnce([{ verifiedAt: at }]) }),
      "ok",
    );
  });

  it("แจ้งโอนที่ร้านยังไม่ยืนยัน หรือถูกปฏิเสธ (verifiedAt = null) ไม่นับ", () => {
    assert.equal(paidOnce([]), false);
    assert.equal(paidOnce([{ verifiedAt: null }, { verifiedAt: null }]), false);
    assert.equal(paidOnce([{ verifiedAt: null }, { verifiedAt: at }]), true);
  });
});

describe("รีวิว — แก้ได้ 7 วันนับจากเขียนครั้งแรก", () => {
  const created = new Date("2026-09-01T00:00:00Z");

  it("ภายในช่วงแก้ได้ ครบ 7 วันพอดีแล้วแก้ไม่ได้", () => {
    assert.equal(REVIEW_EDIT_DAYS, 7);
    assert.equal(canEditReview(created, new Date("2026-09-07T23:59:59Z")), true);
    assert.equal(canEditReview(created, new Date("2026-09-08T00:00:00Z")), false);
    assert.equal(canEditReview(created, new Date("2026-09-20T00:00:00Z")), false);
  });

  it("นับจาก createdAt เสมอ — วันสุดท้ายไม่เลื่อนตามการแก้", () => {
    assert.equal(reviewEditableUntil(created).toISOString(), "2026-09-08T00:00:00.000Z");
  });

  it("บอกได้ว่าร้านตอบก่อนลูกค้าแก้", () => {
    const at = (s: string) => new Date(s);
    assert.equal(repliedBeforeEdit({ creatorRepliedAt: null, updatedAt: at("2026-09-02") }), false);
    assert.equal(repliedBeforeEdit({ creatorRepliedAt: at("2026-09-02"), updatedAt: null }), false);
    assert.equal(
      repliedBeforeEdit({ creatorRepliedAt: at("2026-09-02"), updatedAt: at("2026-09-03") }),
      true,
    );
    assert.equal(
      repliedBeforeEdit({ creatorRepliedAt: at("2026-09-04"), updatedAt: at("2026-09-03") }),
      false,
    );
  });
});

describe("รีวิว — ตัวตนผู้รีวิวบนหน้าร้าน", () => {
  it("เหลือแค่ตัวอักษรแรก ตัวพิมพ์ใหญ่", () => {
    assert.equal(reviewerInitial("Mali Srisuk"), "M");
    assert.equal(reviewerInitial("mali"), "M");
    assert.equal(reviewerInitial("สมชาย ใจดี"), "ส");
  });

  it("ข้ามสระหน้าภาษาไทย — ได้พยัญชนะ ไม่ใช่ 'เ' ที่อ่านไม่ออก", () => {
    assert.equal(reviewerInitial("เอก"), "อ");
    assert.equal(reviewerInitial("  ไก่"), "ก");
    assert.equal(reviewerInitial("แพร"), "พ");
    assert.equal(reviewerInitial("(เอก)"), "อ");
  });

  it("ข้ามอีโมจิ/สัญลักษณ์นำหน้า และไม่ผ่าคู่ surrogate", () => {
    assert.equal(reviewerInitial("🎨 Art"), "A");
    assert.equal(reviewerInitial("123"), "1");
  });

  it("ไม่มีตัวอักษรให้ใช้ = null (หน้าจอเขียนว่า 'ลูกค้า')", () => {
    assert.equal(reviewerInitial(""), null);
    assert.equal(reviewerInitial(null), null);
    assert.equal(reviewerInitial("   "), null);
    assert.equal(reviewerInitial("🎨"), null);
  });
});

describe("รีวิว — เดือนที่สั่ง", () => {
  it("ฟอร์แมตเป็นเดือน+ปีตามภาษา ไม่มีวันที่", () => {
    assert.equal(formatYearMonth("2026-09", "en"), "Sep 2026");
    const th = formatYearMonth("2026-09", "th");
    assert.match(th, /2569/);
    assert.match(th, /ก\.ย\./);
  });

  it("เดือนแรก/สุดท้ายของปีไม่เลื่อนข้ามเขตเวลา", () => {
    assert.equal(formatYearMonth("2026-01", "en"), "Jan 2026");
    assert.equal(formatYearMonth("2026-12", "en"), "Dec 2026");
  });

  it("รูปแบบผิดคืนค่าเดิม ไม่ใช่ 'Invalid Date'", () => {
    assert.equal(formatYearMonth("2026-13", "en"), "2026-13");
    assert.equal(formatYearMonth("nope", "th"), "nope");
  });
});

describe("กติกาใน SQL ต้องตรงกับกติกาใน JS", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("ทุกจุดที่อ่านงาน completed ในคิวรีประวัติร้าน/รีวิว ต้องกรองด้วย PAID_ONCE_SQL เสมอ", () => {
    for (const file of ["lib/queries/reputation.ts", "lib/reputation/actions.ts"]) {
      const src = read(file);
      const parts = src.split("status = 'completed'");
      assert.ok(parts.length > 1, `${file} ไม่มีเงื่อนไข completed เลย`);
      for (const after of parts.slice(1)) {
        assert.match(
          after.slice(0, 80),
          /\$\{PAID_ONCE_SQL\}/,
          `${file}: งาน completed ที่ไม่ได้กรอง PAID_ONCE_SQL — ออเดอร์ไม่มีเงินจะหลุดเข้าสถิติ`,
        );
      }
    }
  });

  it("เงื่อนไขเงินต้องไม่ใช่ยอด ณ ตอนอ่าน — ไม่งั้นร้านกด void แล้วรีวิว/สถิติที่ไม่ชอบหายไป", () => {
    for (const file of ["lib/queries/reputation.ts", "lib/reputation/actions.ts"]) {
      const code = read(file)
        .split("\n")
        .filter((l) => !/^\s*(\*|\/\/|\/\*\*)/.test(l))
        .join("\n");
      assert.doesNotMatch(code, /amount_paid_cents/, file);
    }
    const once = read("lib/reputation/paid-once-sql.ts");
    assert.match(once, /pv\.verified_at is not null/);
    // ⚠️ ห้ามกรอง voided_at — แถวที่ยกเลิกการยืนยันต้องยังนับว่า "เคยยืนยัน"
    const onceCode = once.slice(once.indexOf("sql`"));
    assert.doesNotMatch(onceCode, /voided_at/);
  });

  it("ร้านยกเลิก = event ยกเลิกที่ actor เป็น creator บนออเดอร์ที่ร้านเคยยืนยันเงินเท่านั้น", () => {
    const src = read("lib/queries/reputation.ts");
    assert.match(src, /o\.status = 'cancelled'\s+and \$\{PAID_ONCE_SQL\}/);
    assert.match(src, /event_data->>'actor' = 'creator'/);
  });

  it("เวลาส่งมอบไม่ได้มาจาก event delivered อย่างเดียว — ต้องดูแถว delivery ก่อน", () => {
    const src = read("lib/queries/reputation.ts");
    assert.match(src, /from delivery d\s+where d\.order_id = o\.id and d\.released_at is not null/);
    assert.match(src, /handover_at <= due_at/);
    assert.doesNotMatch(src, /delivered_at <= due_at/);
  });

  it("คิวรี event ระบบมี is_system_event ใน WHERE — ไม่งั้นใช้ partial index ไม่ได้", () => {
    const src = read("lib/queries/reputation.ts");
    const probes = src.split("from message m").slice(1);
    assert.ok(probes.length >= 2);
    for (const p of probes) {
      assert.match(p.slice(0, 120), /m\.is_system_event|\$\{CREATOR_REOPEN\}/);
    }
    assert.match(src, /const CREATOR_REOPEN = sql`m\.is_system_event/);
  });
});

describe("ข้อความประวัติร้าน/รีวิว — ครบทั้งสองภาษา", () => {
  it("ทุกคีย์มีทั้งไทยและอังกฤษ และภาษาอังกฤษไม่มีภาษาไทยหลุด", () => {
    const th = getDictionary("th");
    const en = getDictionary("en");
    for (const section of ["reputation", "review"] as const) {
      const thKeys = Object.keys(th[section]).sort();
      assert.deepEqual(Object.keys(en[section]).sort(), thKeys, section);
      for (const [k, v] of Object.entries(en[section])) {
        assert.ok(v.length > 0, `${section}.${k} ว่าง`);
        assert.equal(/[฀-๿]/.test(v), false, `${section}.${k} (en) มีภาษาไทย`);
      }
    }
  });
});
