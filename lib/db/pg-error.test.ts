import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isUniqueViolation } from "./pg-error";

/**
 * รูปร่าง error จำลองจากของจริง — ชน primary key บน Neon ผ่าน drizzle 0.45 ได้
 * `DrizzleQueryError("Failed query: ...")` ที่มี `cause` เป็น `NeonDbError`
 * `{ code: "23505", constraint: "<ชื่อ>" }` และข้อความชั้นนอกไม่มีชื่อ constraint เลย
 */
function drizzleWrapped(constraint: string) {
  const cause = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint,
  });
  return Object.assign(new Error("Failed query: insert into order_quote ..."), { cause });
}

describe("isUniqueViolation", () => {
  it("เจอ constraint ใน cause ที่ drizzle ห่อไว้", () => {
    const err = drizzleWrapped("order_quote_live_idx");
    // นี่คือเหตุผลที่เช็คแบบเดิมพัง
    assert.equal(String(err).includes("order_quote_live_idx"), false);
    assert.equal(isUniqueViolation(err, "order_quote_live_idx"), true);
  });

  it("ชน constraint ตัวอื่นไม่นับ", () => {
    assert.equal(isUniqueViolation(drizzleWrapped("order_code_unique"), "order_quote_live_idx"), false);
  });

  it("error ที่ไม่ใช่ unique violation ไม่นับ", () => {
    const err = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("syntax"), { code: "42601" }),
    });
    assert.equal(isUniqueViolation(err, "order_quote_live_idx"), false);
  });

  it("error ที่ไม่ห่อ (ไดรเวอร์ตรง) ก็ยังจับได้", () => {
    const err = Object.assign(new Error("dup"), { code: "23505", constraint_name: "order_code_unique" });
    assert.equal(isUniqueViolation(err, "order_code_unique"), true);
  });

  it("ค่าแปลก ๆ ไม่ทำให้ throw", () => {
    assert.equal(isUniqueViolation(null, "x"), false);
    assert.equal(isUniqueViolation("boom", "x"), false);
    assert.equal(isUniqueViolation(undefined, "x"), false);
  });
});
