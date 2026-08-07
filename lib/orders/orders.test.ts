import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowedNext,
  assertTransition,
  canTransition,
  isTerminal,
  TransitionError,
} from "./state-machine";
import { quoteOrder, type PricingService } from "./pricing";
import { generateOrderCode, isOrderCode } from "./code";
import type { OrderStatus } from "@/lib/types";

/**
 * ตรรกะที่พลาดแล้วเสียเงินจริง — คุ้มที่จะมีเทสต์ถึงแม้โปรเจกต์ยังไม่มี test suite ใหญ่
 * รันด้วย `pnpm test` (node:test ผ่าน tsx ไม่ต้องลง framework เพิ่ม)
 */

describe("state machine", () => {
  it("ลูกค้าข้ามไป delivered เองไม่ได้ — ไม่งั้นโหลดไฟล์ไปฟรี", () => {
    assert.equal(canTransition("requested", "delivered", "client"), false);
    assert.equal(canTransition("accepted", "delivered", "client"), false);
    assert.throws(() => assertTransition("requested", "delivered", "client"), TransitionError);
  });

  it("ลูกค้ากดยอมรับใบเสนอราคาได้ แต่ครีเอเตอร์กดแทนไม่ได้", () => {
    assert.equal(canTransition("quoted", "accepted", "client"), true);
    assert.equal(canTransition("quoted", "accepted", "creator"), false);
  });

  it("แยก wrong_actor ออกจาก not_allowed", () => {
    // เส้นทางมีอยู่ แต่ผิดคน
    const wrongActor = (() => {
      try {
        assertTransition("quoted", "accepted", "creator");
      } catch (e) {
        return e as TransitionError;
      }
    })();
    assert.equal(wrongActor?.reason, "wrong_actor");

    // เส้นทางไม่มีอยู่จริง
    const notAllowed = (() => {
      try {
        assertTransition("completed", "in_progress", "creator");
      } catch (e) {
        return e as TransitionError;
      }
    })();
    assert.equal(notAllowed?.reason, "not_allowed");
  });

  it("สถานะปลายทางไปต่อไม่ได้เลย ไม่ว่าใครกด", () => {
    for (const s of ["completed", "declined", "cancelled", "expired"] as const) {
      assert.equal(isTerminal(s), true, s);
      for (const actor of ["creator", "client", "system"] as const) {
        assert.deepEqual(allowedNext(s, actor), [], `${s}/${actor}`);
      }
    }
  });

  it("ทุกสถานะที่ไปต่อได้ต้องเดินถึง terminal ได้จริง — ไม่มีออเดอร์ติดค้างถาวร", () => {
    const seen = new Set<OrderStatus>();
    const reaches = (from: OrderStatus): boolean => {
      if (isTerminal(from)) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      const next = (["creator", "client", "system"] as const).flatMap((a) => allowedNext(from, a));
      const ok = next.some((to) => reaches(to));
      seen.delete(from);
      return ok;
    };
    const all: OrderStatus[] = [
      "requested", "reviewing", "quoted", "accepted", "in_progress",
      "in_review", "revision_requested", "delivered",
    ];
    for (const s of all) assert.equal(reaches(s), true, `${s} เดินไม่ถึง terminal`);
  });
});

describe("pricing", () => {
  const service: PricingService = {
    title: "วาดภาพครึ่งตัว",
    basePriceCents: 150_000, // 1,500 บาท
    tiers: [
      { id: "t1", label: "ลงสีแบน", priceDeltaCents: 0 },
      { id: "t2", label: "ลงสีเต็ม", priceDeltaCents: 80_000 },
    ],
    options: [
      {
        id: "o1", label: "เพิ่มตัวละคร", priceDeltaCents: 60_000,
        inputType: "quantity", maxQuantity: 3,
      },
      {
        id: "o2", label: "เร่งด่วน", priceDeltaCents: 50_000,
        inputType: "checkbox", maxQuantity: null,
      },
    ],
  };

  it("บวก tier กับ option ถูกต้อง", () => {
    const q = quoteOrder(service, {
      tierId: "t2",
      options: [{ optionId: "o1", quantity: 2 }, { optionId: "o2", quantity: 1 }],
    });
    assert.equal(q.subtotalCents, 230_000);            // 1,500 + 800
    assert.equal(q.addonsCents, 170_000);              // 600×2 + 500
    assert.equal(q.totalCents, 400_000);               // 4,000 บาท
    assert.equal(q.lines.length, 4);
  });

  it("จำนวนเกิน maxQuantity ถูกปัดลงมาที่เพดาน ไม่ใช่คิดตามที่ส่งมา", () => {
    const q = quoteOrder(service, { tierId: null, options: [{ optionId: "o1", quantity: 999 }] });
    assert.equal(q.addonsCents, 180_000);              // 600 × 3 ไม่ใช่ × 999
  });

  it("checkbox นับได้แค่ 1 ต่อให้ส่งจำนวนมากมา", () => {
    const q = quoteOrder(service, { tierId: null, options: [{ optionId: "o2", quantity: 50 }] });
    assert.equal(q.addonsCents, 50_000);
  });

  it("tier/option ที่ไม่มีอยู่จริงถูกเมิน ไม่ทำให้ราคาเพี้ยนหรือ throw", () => {
    const q = quoteOrder(service, {
      tierId: "ของปลอม",
      options: [{ optionId: "ไม่มีจริง", quantity: 5 }],
    });
    assert.equal(q.totalCents, 150_000);
    assert.equal(q.lines.length, 1);
  });

  it("จำนวนติดลบหรือเป็นเศษไม่ทำให้ยอดติดลบ", () => {
    for (const quantity of [-5, 0, 0.4, Number.NaN]) {
      const q = quoteOrder(service, { tierId: null, options: [{ optionId: "o1", quantity }] });
      assert.equal(q.totalCents, 150_000, `quantity=${quantity}`);
    }
  });
});

describe("order code", () => {
  it("ไม่มีตัวอักษรที่อ่านสับสน (0 O 1 I L)", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateOrderCode();
      assert.equal(code.length, 8);
      assert.equal(/[0O1IL]/.test(code), false, code);
      assert.equal(isOrderCode(code), true, code);
    }
  });

  it("ปฏิเสธค่าที่ผิดรูป", () => {
    for (const bad of ["", "short", "TOOLONGCODE", "ABCDEFG0", "abcdefgh"]) {
      assert.equal(isOrderCode(bad), false, bad);
    }
  });
});
