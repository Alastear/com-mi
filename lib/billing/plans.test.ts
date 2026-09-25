import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPARISON, PRO_BULLETS, effectivePlan, planDisplay } from "./plans";

describe("แพ็กเกจที่หน้าตั้งค่าบอกผู้ใช้", () => {
  it("ช่วงเบต้า ผู้ใช้ free เห็นว่าเป็น Pro และไม่ถูกเสนอให้อัปเกรด", () => {
    assert.deepEqual(planDisplay("free", true), {
      shown: "pro",
      viaBeta: true,
      offerUpgrade: false,
    });
  });

  it("หมดเบต้าแล้ว ผู้ใช้ free เห็น Free และมีปุ่มอัปเกรด", () => {
    assert.deepEqual(planDisplay("free", false), {
      shown: "free",
      viaBeta: false,
      offerUpgrade: true,
    });
  });

  it("คนที่จ่าย Pro เองไม่ถูกเรียกว่าได้จากเบต้า และไม่ถูกเสนอให้อัปเกรดซ้ำ", () => {
    for (const beta of [true, false]) {
      assert.deepEqual(planDisplay("pro", beta), {
        shown: "pro",
        viaBeta: false,
        offerUpgrade: false,
      });
    }
  });

  it("แพ็กเกจที่โชว์ตรงกับที่ใช้ตัดสินลิมิตจริงเสมอ", () => {
    for (const beta of [true, false]) {
      for (const plan of ["free", "pro", "studio"] as const) {
        assert.equal(planDisplay(plan, beta).shown, effectivePlan(plan, beta));
      }
    }
  });
});

describe("ป้าย 'เร็ว ๆ นี้' บนหน้า /pricing", () => {
  const rows = COMPARISON.flatMap((g) => g.rows);
  const row = (key: string) => rows.find((r) => r.key === key);

  it("ฟีเจอร์ที่ไม่มีโค้ดรองรับต้องติดป้ายครบทุกแถว", () => {
    for (const key of [
      "theme",
      "badge",
      "form",
      "milestone",
      "push",
      "discord",
      "listing",
      "auction",
      "waitlist",
      "crm",
      "analytics",
    ]) {
      assert.equal(row(key)?.soon, true, `แถว ${key} ต้องติดป้าย`);
    }
  });

  it("ลิมิตที่บังคับจริงในโค้ดต้องไม่ถูกติดป้ายว่ายังไม่มี", () => {
    for (const key of ["shop", "portfolio", "services", "active", "inapp", "email", "storage"]) {
      assert.equal(row(key)?.soon, undefined, `แถว ${key} ใช้ได้จริงแล้ว`);
    }
  });

  it("แถวอีเมลไม่สัญญา digest ที่ไม่เคยมี — ทั้งสองแพ็กเกจได้แบบเดียวกัน", () => {
    assert.deepEqual([row("email")?.free, row("email")?.pro], [true, true]);
  });

  it("การ์ด Pro เรียงของที่ใช้ได้จริงไว้ก่อนของที่ยังไม่มี", () => {
    const firstSoon = PRO_BULLETS.findIndex((b) => b.soon);
    assert.ok(firstSoon > 0, "ต้องมีข้อที่ใช้ได้จริงอย่างน้อยหนึ่งข้อก่อน");
    assert.ok(PRO_BULLETS.slice(firstSoon).every((b) => b.soon));
  });
});
