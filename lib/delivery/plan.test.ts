import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ATTACH_MAX, attachPlan, uniqueIds } from "./plan";

/**
 * บั๊กที่เทสต์นี้กันไว้: เตรียมรอบไปแล้วแต่ยังไม่ปล่อย ไฟล์ที่อัปทีหลังหายไปจากจอครีเอเตอร์
 * และไม่มีปุ่มใส่เข้ารอบ — เพราะหน้าจอโชว์ไฟล์ค้างเฉพาะตอนไม่มีรอบเปิด
 */
describe("attachPlan", () => {
  it("ไม่มีรอบเปิด → เตรียมรอบใหม่", () => {
    assert.deepEqual(attachPlan(["m1", "m2"], false, true), { mode: "prepare", mediaIds: ["m1", "m2"] });
  });

  it("มีรอบที่เตรียมไว้แล้ว → ไฟล์ที่อัปทีหลังเพิ่มเข้ารอบนั้น ไม่ใช่เปิดรอบซ้อน", () => {
    assert.deepEqual(attachPlan(["m3"], true, true), { mode: "add", mediaIds: ["m3"] });
  });

  it("ไม่มีไฟล์ค้าง → ไม่มีปุ่ม", () => {
    assert.equal(attachPlan([], true, true), null);
    assert.equal(attachPlan([], false, true), null);
  });

  it("สถานะที่แก้ไฟล์ไม่ได้แล้ว → ไม่มีปุ่ม แม้มีไฟล์ค้าง", () => {
    assert.equal(attachPlan(["m1"], false, false), null);
    assert.equal(attachPlan(["m1"], true, false), null);
  });

  it("ส่งไม่เกิน ATTACH_MAX ต่อครั้ง — ที่เหลือค้างไว้ให้กดรอบถัดไป ไม่ใช่ทั้งชุดตกเพราะ schema ปัด", () => {
    const ids = Array.from({ length: ATTACH_MAX + 5 }, (_, i) => `m${i}`);
    const plan = attachPlan(ids, false, true);
    assert.equal(plan?.mediaIds.length, ATTACH_MAX);
    assert.equal(plan?.mediaIds[0], "m0");
  });

  it("id ซ้ำถูกตัดก่อนนับ", () => {
    assert.deepEqual(attachPlan(["m1", "m1", "m2"], false, true)?.mediaIds, ["m1", "m2"]);
  });
});

describe("uniqueIds", () => {
  it("รักษาลำดับแรกที่เจอ", () => {
    assert.deepEqual(uniqueIds(["b", "a", "b", "c", "a"]), ["b", "a", "c"]);
  });
});
