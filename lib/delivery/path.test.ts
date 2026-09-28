import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canUploadDelivery, deliveryPrefix, isDeliveryPath } from "./path";

describe("ไฟล์ส่งมอบ", () => {
  it("อัปได้เฉพาะตอนงานยังทำอยู่", () => {
    for (const s of ["in_progress", "in_review", "revision_requested"]) {
      assert.equal(canUploadDelivery(s), true, s);
    }
  });

  it("ปิดออเดอร์แล้วเพิ่มไฟล์ไม่ได้ — ไฟล์ที่เพิ่มหลังปิดคือการแก้หลักฐาน", () => {
    for (const s of ["completed", "cancelled", "expired", "declined", "delivered", "requested", "accepted", "disputed", ""]) {
      assert.equal(canUploadDelivery(s), false, s);
    }
  });

  it("key ของออเดอร์หนึ่งไม่ใช่ของอีกออเดอร์", () => {
    assert.equal(isDeliveryPath(`${deliveryPrefix("ABCD2345")}x`, "ABCD2345"), true);
    assert.equal(isDeliveryPath(`${deliveryPrefix("ABCD2345")}x`, "ABCD234"), false);
  });
});
