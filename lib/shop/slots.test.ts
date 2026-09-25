import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openSlotsToShow } from "./slots";

describe("ช่องที่เปิดรับบนหน้าร้าน", () => {
  it("ร้านเปิดรับงานโชว์ตัวเลขตามที่ครีเอเตอร์ตั้ง ไม่หักอะไรออก", () => {
    assert.equal(openSlotsToShow("open", 5), 5);
    assert.equal(openSlotsToShow("open", 1), 1);
  });

  it("ใส่ 0 = ไม่อยากโชว์ ต้องไม่ขึ้นว่า 'เปิดรับ 0 ช่อง'", () => {
    assert.equal(openSlotsToShow("open", 0), null);
  });

  it("ร้านที่ไม่ได้เปิดรับงานต้องไม่ขึ้นว่าเปิดรับกี่ช่อง — ขัดกับป้ายสถานะ", () => {
    assert.equal(openSlotsToShow("closed", 5), null);
    assert.equal(openSlotsToShow("vacation", 5), null);
    assert.equal(openSlotsToShow("waitlist", 5), null);
  });

  it("ค่าเพี้ยนจาก DB ไม่หลุดขึ้นจอ", () => {
    assert.equal(openSlotsToShow("open", -1), null);
    assert.equal(openSlotsToShow("open", Number.NaN), null);
    assert.equal(openSlotsToShow("open", 2.5), null);
  });
});
