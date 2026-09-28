import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderVersion, versionIso } from "./version";

describe("รุ่นของออเดอร์ (updatedAt เป็นมิลลิวินาที)", () => {
  it("เศษไมโครวินาทีจาก Postgres ถูกตัดทิ้ง ไม่ปัดขึ้น — ต้องตรงกับ date_trunc('milliseconds')", () => {
    // รูปแบบที่ driver ส่งมาให้ drizzle แปลงเป็น Date (`new Date(value)`)
    const fromDb = new Date("2026-09-28 03:12:14.665999+00");
    assert.equal(orderVersion(fromDb), Date.UTC(2026, 8, 28, 3, 12, 14, 665));
    assert.equal(versionIso(orderVersion(fromDb)), "2026-09-28T03:12:14.665Z");
  });

  it("ไป-กลับระหว่างตัวเลขกับ ISO ได้ค่าเดิม", () => {
    const v = Date.UTC(2026, 0, 1, 0, 0, 0, 7);
    assert.equal(new Date(versionIso(v)).getTime(), v);
  });

  it("เขียนสองครั้งห่างกัน 1 ms = คนละรุ่น", () => {
    const a = new Date("2026-09-28T03:12:14.665Z");
    const b = new Date("2026-09-28T03:12:14.666Z");
    assert.notEqual(orderVersion(a), orderVersion(b));
  });
});
