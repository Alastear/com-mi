import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GRACE_MS, isStray, referencedPaths } from "./cleanup";

/**
 * เทสต์ของงานที่ "ลบไฟล์ทิ้ง" ต้องเน้นฝั่งที่ห้ามลบเป็นหลัก
 * ลบพลาดหนึ่งไฟล์คือของหายถาวร ส่วนไม่ลบพลาดคือเสียพื้นที่ไม่กี่ KB
 */
describe("เก็บกวาดไฟล์กำพร้า", () => {
  const now = 1_800_000_000_000;
  const old = new Date(now - GRACE_MS - 1000);
  const fresh = new Date(now - 1000);

  it("ไฟล์ที่ยังมีแถวชี้ถึงห้ามลบ แม้จะเก่าแค่ไหน", () => {
    const ref = new Set(["banner/a.webp"]);
    assert.equal(isStray({ pathname: "banner/a.webp", uploadedAt: old }, ref, now), false);
  });

  it("ไฟล์ที่ไม่มีใครชี้ถึงและเก่าเกินเวลาผ่อนผัน ลบได้", () => {
    assert.equal(isStray({ pathname: "banner/b.webp", uploadedAt: old }, new Set(), now), true);
  });

  it("ไฟล์ที่เพิ่งอัปห้ามลบ — อาจกำลังเดินทางไป registerMedia อยู่", () => {
    // นี่คือเคสที่อันตรายที่สุด: ผู้ใช้อัปเสร็จแล้วแต่ action ยังไม่ทันเขียนแถว
    assert.equal(isStray({ pathname: "banner/c.webp", uploadedAt: fresh }, new Set(), now), false);
  });

  it("ที่ขอบเวลาผ่อนผันพอดี ยังไม่ลบ", () => {
    const edge = new Date(now - GRACE_MS);
    assert.equal(isStray({ pathname: "x", uploadedAt: edge }, new Set(), now), false);
  });

  it("โปสเตอร์ของวิดีโอถือว่ามีคนใช้ ทั้งที่ไม่มีแถวเป็นของตัวเอง", () => {
    /**
     * โปสเตอร์ถูกเก็บเป็นคอลัมน์ของแถววิดีโอ ไม่ได้มีแถวแยก
     * ถ้าดูแค่ `pathname` โปสเตอร์ทุกอันจะดูเหมือนไฟล์กำพร้าและถูกลบเรียบ
     */
    const ref = referencedPaths([
      { pathname: "portfolio/vid.mp4", posterPathname: "portfolio/vid-poster.webp" },
    ]);
    assert.equal(isStray({ pathname: "portfolio/vid-poster.webp", uploadedAt: old }, ref, now), false);
    assert.equal(isStray({ pathname: "portfolio/vid.mp4", uploadedAt: old }, ref, now), false);
  });

  it("แถวที่ pathname เป็น null ไม่ทำให้ชุดอ้างอิงเพี้ยน", () => {
    const ref = referencedPaths([
      { pathname: null, posterPathname: null },
      { pathname: "a", posterPathname: null },
    ]);
    assert.deepEqual([...ref], ["a"]);
    assert.equal(ref.has(""), false);
  });
});
