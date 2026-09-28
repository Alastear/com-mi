import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUndeliverableAddress } from "./address";

describe("isUndeliverableAddress", () => {
  it("ผู้ใช้ทดสอบในฐานข้อมูลจริงไม่ถูกส่ง", () => {
    assert.equal(isUndeliverableAddress("e2e-new@commi.local"), true);
    assert.equal(isUndeliverableAddress("e2e-test@commi.local"), true);
    assert.equal(isUndeliverableAddress("E2E@Commi.LOCAL"), true);
    assert.equal(isUndeliverableAddress("a@b.local."), true);
  });

  it("TLD ที่มาตรฐานสงวนไว้ทั้งหมด", () => {
    for (const d of ["x.test", "x.invalid", "x.example", "localhost", "x.localhost"]) {
      assert.equal(isUndeliverableAddress(`a@${d}`), true, d);
    }
  });

  it("ที่อยู่จริงผ่านเสมอ — รวมโดเมนที่แค่มีคำคล้าย ๆ", () => {
    for (const a of [
      "alastearalize@gmail.com",
      "a@local.co.th",
      "a@testing.com",
      "a@example.com",
      "a@mylocal",
      "a@ไทย.ไทย",
      "not-an-email",
    ]) {
      assert.equal(isUndeliverableAddress(a), false, a);
    }
  });
});
