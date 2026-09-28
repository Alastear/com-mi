import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moneyAckFrom, moneyMoved, needsMoneyConfirm } from "./cancel";
import { paymentMode } from "./release";
import { closedText, completionOf } from "./labels";
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
    assert.deepEqual(m, { paidCents: 150_000, pendingCents: 0, rows: 1 });
    assert.equal(needsMoneyConfirm("cancelled", m), true);
  });

  it("แจ้งโอนแล้วแต่ยังไม่มีใครตอบ = ต้องถาม แม้ยอดที่นับยังเป็น 0", () => {
    const m = moneyMoved(0, [{ amountCents: 50_000, state: "pending" }]);
    assert.deepEqual(m, { paidCents: 0, pendingCents: 50_000, rows: 1 });
    assert.equal(needsMoneyConfirm("cancelled", m), true);
  });

  it("รายการที่ถูกตอบว่ายังไม่ได้รับ/ยกเลิกการยืนยัน ยังนับว่ามีเงินเกี่ยวข้อง", () => {
    // ครีเอเตอร์บอกว่าไม่ได้รับ ไม่ได้แปลว่าลูกค้าไม่ได้โอน
    const m = moneyMoved(0, [
      { amountCents: 50_000, state: "rejected" },
      { amountCents: 70_000, state: "voided" },
    ]);
    assert.deepEqual(m, { paidCents: 0, pendingCents: 0, rows: 2 });
    assert.equal(needsMoneyConfirm("cancelled", m), true);
  });

  it("snapshot ที่ส่งให้ server ตอนยกเลิก — ไม่มีเงินเกี่ยวข้องคือศูนย์ทั้งคู่", () => {
    assert.deepEqual(moneyAckFrom(null), { rows: 0, paidCents: 0 });
    assert.deepEqual(
      moneyAckFrom(moneyMoved(50_000, [{ amountCents: 50_000, state: "verified" }])),
      { rows: 1, paidCents: 50_000 },
    );
  });

  it("ยอดที่รอตอบนับเฉพาะแถว pending", () => {
    const m = moneyMoved(100_000, [
      { amountCents: 100_000, state: "verified" },
      { amountCents: 30_000, state: "rejected" },
      { amountCents: 20_000, state: "pending" },
    ]);
    assert.deepEqual(m, { paidCents: 100_000, pendingCents: 20_000, rows: 3 });
  });

  it("ถามเฉพาะตอนยกเลิก — ปุ่มอื่นยังกดได้ทันทีเหมือนเดิม", () => {
    const m = moneyMoved(150_000, [{ amountCents: 150_000, state: "verified" }]);
    for (const to of ORDER_STATUSES) {
      assert.equal(needsMoneyConfirm(to, m), to === "cancelled", to);
    }
  });
});

describe("โหมดแผงชำระเงิน", () => {
  it("ยกเลิก/ปฏิเสธ/หมดอายุเป็น closed", () => {
    for (const s of ["cancelled", "declined", "expired"] as const) {
      assert.equal(paymentMode(s), "closed", s);
    }
  });

  it("completed ยังเป็น open — ครีเอเตอร์ต้องยกเลิกการยืนยันสลิปปลอมได้หลังงานจบ", () => {
    /**
     * ลูกค้าส่งสลิปปลอม ครีเอเตอร์ยืนยัน ส่งงาน ลูกค้ากดเสร็จ แล้วครีเอเตอร์เพิ่งพบว่าเงินไม่เข้า
     * ถ้า completed เป็น closed ปุ่มยกเลิกการยืนยันหาย ไฟล์ก็ล็อกกลับไม่ได้
     */
    assert.equal(paymentMode("completed"), "open");
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

  it("ระบบปิดงานให้ ต้องไม่ขึ้นว่ายืนยันรับงานแล้ว — ลูกค้าไม่ได้กดอะไร", () => {
    for (const t of dicts) {
      const auto = closedText(t, "completed", { by: "system", from: "delivered" });
      assert.equal(auto?.body, t.orderClosed.completedAutoBody);
      assert.notEqual(auto?.body, t.orderClosed.completedBody);
      assert.equal(auto?.title, t.orderClosed.completed);
      // ลูกค้ากดรับงานที่ส่งมอบแล้ว / ไม่รู้ว่าใคร/จากไหน = ข้อความเดิม
      assert.equal(closedText(t, "completed", { by: "client", from: "delivered" })?.body, t.orderClosed.completedBody);
      assert.equal(closedText(t, "completed", { by: "client", from: null })?.body, t.orderClosed.completedBody);
      assert.equal(closedText(t, "completed", { by: null, from: null })?.body, t.orderClosed.completedBody);
      assert.equal(closedText(t, "completed", null)?.body, t.orderClosed.completedBody);
      assert.equal(closedText(t, "completed")?.body, t.orderClosed.completedBody);
      // actor มีผลกับ completed เท่านั้น
      assert.equal(closedText(t, "expired", { by: "system", from: "requested" })?.body, t.orderClosed.expiredBody);
    }
  });

  it("ลูกค้าปิดงานระหว่างรอบแก้ ต้องไม่ขึ้นว่ายืนยันรับงานแล้ว — รอบแก้ที่ค้างไม่ได้ส่ง", () => {
    for (const t of dicts) {
      for (const from of ["in_progress", "in_review", "revision_requested"]) {
        const early = closedText(t, "completed", { by: "client", from });
        assert.equal(early?.body, t.orderClosed.completedEarlyBody, from);
        assert.notEqual(early?.body, t.orderClosed.completedBody, from);
        assert.equal(early?.title, t.orderClosed.completed, from);
      }
    }
  });
});

describe("ใครปิดงาน และปิดจากไหน (completionOf)", () => {
  const ev = (eventType: string | null, eventData: Record<string, string | number> | null, isSystemEvent = true) => ({
    isSystemEvent,
    eventType,
    eventData,
  });

  it("อ่าน actor และ from จาก event status_changed → completed", () => {
    const msgs = [
      ev("order_created", null),
      ev("status_changed", { from: "in_progress", to: "delivered", actor: "creator" }),
      ev("auto_complete_warned", { actor: "system", days: 2 }),
      ev("status_changed", { from: "delivered", to: "completed", actor: "system" }),
    ];
    assert.deepEqual(completionOf(msgs), { by: "system", from: "delivered" });
    msgs[3] = ev("status_changed", { from: "delivered", to: "completed", actor: "client" });
    assert.deepEqual(completionOf(msgs), { by: "client", from: "delivered" });
    // รูปเดียวกับที่ `transitionOrder` เขียนตอนลูกค้าปิดงานระหว่างรอบแก้
    msgs[3] = ev("status_changed", { from: "revision_requested", to: "completed", actor: "client" });
    assert.deepEqual(completionOf(msgs), { by: "client", from: "revision_requested" });
  });

  it("ไม่มี event ปิดงาน / ไม่มี actor / เป็นข้อความแชท = ไม่เดา", () => {
    assert.equal(completionOf([]), null);
    assert.equal(completionOf([ev("status_changed", { to: "delivered", actor: "system" })]), null);
    assert.deepEqual(completionOf([ev("status_changed", { to: "completed" })]), { by: null, from: null });
    assert.equal(completionOf([ev(null, { to: "completed", actor: "system" }, false)]), null);
  });

  it("event เงินที่มี actor system หลังปิดงานไม่ทำให้สับสน", () => {
    const msgs = [
      ev("status_changed", { from: "delivered", to: "completed", actor: "client" }),
      ev("payment_voided", { actor: "system", amount: 100 }),
    ];
    assert.deepEqual(completionOf(msgs), { by: "client", from: "delivered" });
  });
});
