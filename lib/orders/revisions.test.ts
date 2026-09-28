import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consumesRevision, revisionHint, revisionQuota } from "./revisions";
import { allowedNext, canTransition } from "./state-machine";
import { actionLabel, eventText } from "./labels";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { ORDER_STATUSES } from "@/lib/types";

/**
 * โควตารอบแก้ — ถ้าชุดนี้พัง ลูกค้าจะกลับไปขอแก้ได้ไม่จำกัดอีก
 * หรือปุ่มขอแก้จะหายทั้งที่ยังเหลือสิทธิ์
 */

const th = getDictionary("th");
const en = getDictionary("en");

describe("นับสิทธิ์ขอแก้ไข", () => {
  it("ยังไม่ได้ใช้ = เหลือเต็ม", () => {
    assert.deepEqual(revisionQuota(0, 2), { used: 0, allowed: 2, remaining: 2, exhausted: false });
  });

  it("เหลือครั้งสุดท้ายยังกดได้", () => {
    assert.deepEqual(revisionQuota(1, 2), { used: 1, allowed: 2, remaining: 1, exhausted: false });
  });

  it("ใช้ครบแล้ว = หมด", () => {
    assert.equal(revisionQuota(2, 2).exhausted, true);
    assert.equal(revisionQuota(2, 2).remaining, 0);
  });

  it("เกินโควตา (ไม่ควรเกิด) ยังนับว่าหมด และเหลือไม่ติดลบ", () => {
    assert.deepEqual(revisionQuota(5, 2), { used: 5, allowed: 2, remaining: 0, exhausted: true });
  });

  it("เมนูที่ไม่รวมการแก้ไข (0 ครั้ง) = หมดตั้งแต่แรก", () => {
    assert.equal(revisionQuota(0, 0).exhausted, true);
  });

  it("ค่าเพี้ยนถือเป็น 0 — ไม่มีสิทธิ์ดีกว่าสิทธิ์ไม่จำกัด", () => {
    assert.equal(revisionQuota(0, Number.NaN).exhausted, true);
    assert.equal(revisionQuota(0, -3).exhausted, true);
    assert.equal(revisionQuota(Number.NaN, 2).remaining, 2);
    assert.equal(revisionQuota(-1, 2).remaining, 2);
  });
});

describe("การเปลี่ยนสถานะที่กินโควตา", () => {
  it("ลูกค้าเข้า revision_requested = นับ สถานะอื่นไม่นับ", () => {
    for (const s of ORDER_STATUSES) {
      assert.equal(consumesRevision(s, "client"), s === "revision_requested", s);
    }
  });

  it("ครีเอเตอร์เปิดรอบแก้เอง ไม่นับสิทธิ์ลูกค้า", () => {
    assert.equal(consumesRevision("revision_requested", "creator"), false);
  });

  it("ทางเข้า revision_requested: ลูกค้าจาก in_review/delivered และครีเอเตอร์จาก delivered เท่านั้น", () => {
    // ⚠️ ถ้ามีทางเข้าใหม่ ชุดนี้จะพังเพื่อบังคับให้ตัดสินใหม่ว่าทางนั้นควรนับโควตาไหม
    const into = ORDER_STATUSES.filter((s) =>
      (["creator", "client", "system"] as const).some((a) => canTransition(s, "revision_requested", a)),
    );
    assert.deepEqual(into, ["in_review", "delivered"]);
    for (const from of into) {
      assert.equal(canTransition(from, "revision_requested", "client"), true, from);
    }
    /**
     * ครีเอเตอร์ออกจาก delivered ได้ — ไม่งั้นไฟล์ผิดที่ส่งหลังลูกค้าใช้สิทธิ์ครบจะค้างตลอดกาล
     * แต่ไม่ใช่จาก in_review: ตรงนั้นครีเอเตอร์ยังส่งงาน/ย้ายเองได้ตามปกติอยู่แล้ว
     */
    assert.equal(canTransition("delivered", "revision_requested", "creator"), true);
    assert.equal(canTransition("in_review", "revision_requested", "creator"), false);
  });
});

describe("ครีเอเตอร์ถอยจากรอบตรวจกลับไปทำต่อ", () => {
  it("in_review → in_progress กดได้เฉพาะครีเอเตอร์ และไม่กินโควตาของลูกค้า", () => {
    /**
     * ไม่มีเส้นนี้ in_review เป็นทางเดียว: ลูกค้าใช้สิทธิ์ครบ ปุ่มขอแก้หาย ครีเอเตอร์ยอมแก้ให้ตามที่ทักในแชท
     * แต่ออกได้แค่ส่งไฟล์จริง (ต้องจ่ายครบ) หรือยกเลิก — สถานะค้าง "รอลูกค้าตรวจ" ทั้งที่กำลังแก้อยู่
     */
    assert.equal(canTransition("in_review", "in_progress", "creator"), true);
    assert.equal(canTransition("in_review", "in_progress", "client"), false);
    assert.ok(allowedNext("in_review", "creator").includes("in_progress"));
    assert.equal(consumesRevision("in_progress", "creator"), false);
  });

  it("ปุ่มบอกว่ากลับไปทำต่อ ไม่ใช่ 'เริ่มทำงาน' และบอกว่าไม่นับสิทธิ์ลูกค้า ทั้งสองภาษา", () => {
    for (const t of [th, en]) {
      assert.equal(actionLabel(t, "in_progress", "creator", "in_review"), t.orderAction.backToWork);
      assert.notEqual(t.orderAction.backToWork, t.orderAction.startWork);
      // จากสถานะอื่นยังเป็น "เริ่มทำงาน" เหมือนเดิม
      assert.equal(actionLabel(t, "in_progress", "creator", "accepted"), t.orderAction.startWork);
      assert.equal(actionLabel(t, "in_progress", "creator"), t.orderAction.startWork);
    }
  });
});

describe("ข้อความข้างปุ่มขอแก้ไข", () => {
  for (const [locale, t] of [["th", th], ["en", en]] as const) {
    it(`ยังเหลือ = โชว์ปุ่ม พร้อมบอกว่าเหลือกี่ครั้งจากกี่ครั้ง (${locale})`, () => {
      const h = revisionHint(t, revisionQuota(1, 3));
      assert.equal(h.blocked, false);
      assert.match(h.text, /2/);
      assert.match(h.text, /3/);
      assert.equal(/\{\w+\}/.test(h.text), false, "ห้ามเหลือ placeholder");
    });

    it(`ใช้ครบ = เอาปุ่มออก บอกว่าใช้ไปเท่าไหร่ และพาไปแชท (${locale})`, () => {
      const h = revisionHint(t, revisionQuota(2, 2));
      assert.equal(h.blocked, true);
      assert.match(h.text, /2/);
      assert.equal(h.text, t.orderAction.revisionsExhausted.replace("{used}", "2").replace("{total}", "2"));
      assert.equal(/\{\w+\}/.test(h.text), false);
    });

    it(`ไม่มีสิทธิ์ตั้งแต่แรก = ข้อความของมันเอง ไม่ใช่ "ใช้ครบ 0/0" (${locale})`, () => {
      const h = revisionHint(t, revisionQuota(0, 0));
      assert.equal(h.blocked, true);
      assert.equal(h.text, t.orderAction.revisionsNone);
    });
  }
});

describe("event ขอแก้ไขบน timeline", () => {
  it("event ที่นับโควตาแล้วบอกครั้งที่เท่าไหร่จากกี่ครั้ง ทั้งสองภาษา", () => {
    const data = { from: "delivered", to: "revision_requested", actor: "client", revision: 1, revisionsAllowed: 2 };
    assert.equal(eventText(th, "status_changed", data, "th"), "เปลี่ยนสถานะเป็น ขอแก้ไข · ครั้งที่ 1 จาก 2");
    assert.equal(
      eventText(en, "status_changed", data, "en"),
      "Status changed to Revision requested · revision 1 of 2",
    );
  });

  it("event เก่าที่ไม่มีเลขรอบ แสดงแค่สถานะ ไม่เดาเลขให้", () => {
    const data = { from: "in_review", to: "revision_requested", actor: "client" };
    assert.equal(eventText(th, "status_changed", data, "th"), "เปลี่ยนสถานะเป็น ขอแก้ไข");
  });

  it("เลขรอบเพี้ยนไม่ขึ้น NaN", () => {
    const data = { to: "revision_requested", revision: "x", revisionsAllowed: 2 };
    const text = eventText(en, "status_changed", data, "en")!;
    assert.equal(text.includes("NaN"), false);
    assert.equal(text, "Status changed to Revision requested");
  });

  it("สถานะอื่นไม่ต่อท้ายเลขรอบ แม้ data จะมี", () => {
    const data = { to: "in_progress", revision: 1, revisionsAllowed: 2 };
    assert.equal(eventText(th, "status_changed", data, "th"), "เปลี่ยนสถานะเป็น กำลังทำ");
  });
});
