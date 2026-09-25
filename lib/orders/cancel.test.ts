import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moneyMoved, needsMoneyConfirm } from "./cancel";
import { paymentMode } from "./release";
import { closedText } from "./labels";
import { isTerminal } from "./state-machine";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { ORDER_STATUSES } from "@/lib/types";

/**
 * ยกเลิกหลังเงินขยับแล้ว — ถ้าชุดนี้พัง ปุ่มยกเลิกจะกลับไปยิงทันทีโดยไม่บอกยอดที่จ่ายไป
 * หรือหน้าออเดอร์ที่ยกเลิกแล้วจะซ่อนรายการเงินอีกครั้ง
 */

describe("เงินที่ขยับแล้วก่อนยกเลิก", () => {
  it("ไม่มีรายการเลยและยอดเป็น 0 = ไม่มีเงินเกี่ยวข้อง ไม่ต้องถาม", () => {
    assert.equal(moneyMoved(0, []), null);
    assert.equal(needsMoneyConfirm("cancelled", moneyMoved(0, [])), false);
  });

  it("ยืนยันรับเงินแล้ว = ต้องถาม และบอกยอดที่ยืนยัน", () => {
    const m = moneyMoved(150_000, [{ amountCents: 150_000, state: "verified" }]);
    assert.deepEqual(m, { paidCents: 150_000, pendingCents: 0 });
    assert.equal(needsMoneyConfirm("cancelled", m), true);
  });

  it("แจ้งโอนแล้วแต่ยังไม่มีใครตอบ = ต้องถาม แม้ยอดที่นับยังเป็น 0", () => {
    const m = moneyMoved(0, [{ amountCents: 50_000, state: "pending" }]);
    assert.deepEqual(m, { paidCents: 0, pendingCents: 50_000 });
    assert.equal(needsMoneyConfirm("cancelled", m), true);
  });

  it("รายการที่ถูกตอบว่ายังไม่ได้รับ/ยกเลิกการยืนยัน ยังนับว่ามีเงินเกี่ยวข้อง", () => {
    // ครีเอเตอร์บอกว่าไม่ได้รับ ไม่ได้แปลว่าลูกค้าไม่ได้โอน
    const m = moneyMoved(0, [
      { amountCents: 50_000, state: "rejected" },
      { amountCents: 70_000, state: "voided" },
    ]);
    assert.deepEqual(m, { paidCents: 0, pendingCents: 0 });
    assert.equal(needsMoneyConfirm("cancelled", m), true);
  });

  it("ยอดที่รอตอบนับเฉพาะแถว pending", () => {
    const m = moneyMoved(100_000, [
      { amountCents: 100_000, state: "verified" },
      { amountCents: 30_000, state: "rejected" },
      { amountCents: 20_000, state: "pending" },
    ]);
    assert.deepEqual(m, { paidCents: 100_000, pendingCents: 20_000 });
  });

  it("ถามเฉพาะตอนยกเลิก — ปุ่มอื่นยังกดได้ทันทีเหมือนเดิม", () => {
    const m = moneyMoved(150_000, [{ amountCents: 150_000, state: "verified" }]);
    for (const to of ORDER_STATUSES) {
      assert.equal(needsMoneyConfirm(to, m), to === "cancelled", to);
    }
  });
});

describe("โหมดแผงชำระเงิน", () => {
  it("สถานะปลายทางทุกตัวเป็น closed — รวม completed ที่ server ยังรับเงินได้", () => {
    for (const s of ORDER_STATUSES) {
      if (isTerminal(s)) assert.equal(paymentMode(s), "closed", s);
    }
    assert.equal(paymentMode("completed"), "closed");
    assert.equal(paymentMode("cancelled"), "closed");
  });

  it("ก่อนตอบรับเป็น not_yet ไม่ใช่ closed — ยังมีทางไปต่อ", () => {
    for (const s of ["requested", "reviewing", "quoted"] as const) {
      assert.equal(paymentMode(s), "not_yet", s);
    }
  });

  it("ระหว่างทำงานเป็น open", () => {
    for (const s of ["accepted", "in_progress", "in_review", "revision_requested", "delivered"] as const) {
      assert.equal(paymentMode(s), "open", s);
    }
  });
});

describe("ข้อความของออเดอร์ที่จบแล้ว", () => {
  const dicts = [getDictionary("th"), getDictionary("en")];

  it("สถานะปลายทางทุกตัวมีหัวข้อและคำอธิบายทั้งสองภาษา", () => {
    for (const t of dicts) {
      for (const s of ORDER_STATUSES) {
        const text = closedText(t, s);
        if (isTerminal(s)) {
          assert.ok(text?.title, `${s} ไม่มีหัวข้อ`);
          assert.ok(text?.body, `${s} ไม่มีคำอธิบาย`);
        } else {
          assert.equal(text, null, s);
        }
      }
    }
  });

  it("ข้อความยกเลิกไม่ใช่ข้อความ 'ยังไม่ต้องโอน รอครีเอเตอร์ตอบรับ' แบบเดิม", () => {
    for (const t of dicts) {
      assert.notEqual(closedText(t, "cancelled")?.body, t.payment.awaitingApprovalBody);
    }
  });
});
