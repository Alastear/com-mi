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
import { BOARD_COLUMNS, ORDER_STATUSES, type OrderStatus } from "@/lib/types";
import { boardDropTarget, boardMenuTargets, columnOf, isOnBoard } from "./board";
import { isPrivateKind, isPublicKind, MEDIA_KINDS } from "@/lib/media/kinds";
import { canRelease, depositSatisfied } from "./release";

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

describe("board", () => {
  it("ครีเอเตอร์ลาก quoted ไปคอลัมน์อื่นไม่ได้ — คนที่กดยอมรับคือลูกค้า", () => {
    for (const c of BOARD_COLUMNS) {
      assert.equal(boardDropTarget("quoted", c), null, c);
    }
  });

  it("ครีเอเตอร์ลากการ์ดที่ delivered ไม่ได้ — รอลูกค้ายืนยันรับงาน", () => {
    for (const c of BOARD_COLUMNS) {
      assert.equal(boardDropTarget("delivered", c), null, c);
    }
  });

  it("เส้นทางที่ลากได้จริงตรงกับ state machine ทุกช่อง", () => {
    for (const from of ORDER_STATUSES) {
      for (const col of BOARD_COLUMNS) {
        const to = boardDropTarget(from, col);
        if (to === null) continue;
        assert.equal(canTransition(from, to, "creator"), true, `${from} → ${to}`);
        assert.equal(columnOf(to), col, `${to} ควรอยู่คอลัมน์ ${col}`);
      }
    }
  });

  it("การย้ายที่เกิดในคอลัมน์เดียวกันต้องมีในเมนู ไม่งั้นทำไม่ได้เลย", () => {
    // สามอย่างนี้เป็นงานประจำวันแต่ลากไม่ได้เพราะต้นทางกับปลายทางอยู่คอลัมน์เดียวกัน
    for (const [from, to] of [
      ["requested", "reviewing"],
      ["accepted", "in_progress"],
      ["revision_requested", "in_progress"],
    ] as const) {
      assert.equal(columnOf(from), columnOf(to), `${from}/${to} ควรอยู่คอลัมน์เดียวกัน`);
      assert.equal(boardDropTarget(from, columnOf(to)!), null, "ลากไม่ได้");
      assert.ok(boardMenuTargets(from).includes(to), `เมนูต้องมี ${to}`);
    }
  });

  it("สถานะปลายทางไม่ขึ้นบอร์ด", () => {
    for (const s of ["completed", "declined", "cancelled", "expired"] as const) {
      assert.equal(isOnBoard(s), false, s);
      assert.equal(columnOf(s), null, s);
    }
  });
});

describe("แยกไฟล์สาธารณะกับไฟล์ส่วนตัว", () => {
  it("ไฟล์ส่งมอบ สลิป WIP และไฟล์อ้างอิง ต้องไม่ใช่ชนิดสาธารณะ", () => {
    for (const k of ["final", "payment_proof", "wip", "reference"] as const) {
      assert.equal(isPrivateKind(k), true, k);
      assert.equal(isPublicKind(k), false, `${k} ต้องออก token ของ store สาธารณะไม่ได้`);
    }
  });

  it("รูปหน้าร้านยังเป็นชนิดสาธารณะ", () => {
    for (const k of ["avatar", "banner", "portfolio", "service_cover"] as const) {
      assert.equal(isPublicKind(k), true, k);
      assert.equal(isPrivateKind(k), false, k);
    }
  });

  it("ทุกชนิดต้องอยู่ฝั่งใดฝั่งหนึ่งเสมอ ไม่มีตกหล่น", () => {
    for (const k of MEDIA_KINDS) {
      assert.notEqual(isPublicKind(k), isPrivateKind(k), `${k} ต้องเป็นฝั่งเดียวเท่านั้น`);
    }
  });

  it("ชนิดที่ไม่รู้จักไม่ถือว่าสาธารณะ", () => {
    for (const bad of ["", "FINAL", "final ", "avatar; final"]) {
      assert.equal(isPublicKind(bad), false, bad);
    }
  });
});

describe("เงื่อนไขปล่อยไฟล์ส่งมอบ", () => {
  it("ออเดอร์ยอด ฿0 ต้องไม่ถือว่าจ่ายครบ", () => {
    // เมนูตั้งราคา 0 ได้ และโหมด proposal ยังไม่มี action ไหนเขียน totalCents
    // ถ้าเช็คแค่ paid >= total ออเดอร์แบบนั้นจะ "จ่ายครบ" ตั้งแต่วินาทีที่สร้าง
    assert.equal(canRelease({ totalCents: 0, amountPaidCents: 0 }), false);
    assert.equal(canRelease({ totalCents: 0, amountPaidCents: 100 }), false);
  });

  it("ต้องจ่ายครบจริงถึงปล่อย", () => {
    assert.equal(canRelease({ totalCents: 290_000, amountPaidCents: 289_999 }), false);
    assert.equal(canRelease({ totalCents: 290_000, amountPaidCents: 290_000 }), true);
    assert.equal(canRelease({ totalCents: 290_000, amountPaidCents: 300_000 }), true);
  });

  it("มัดจำ 0 = ไม่บังคับ", () => {
    assert.equal(depositSatisfied({ depositCents: 0, amountPaidCents: 0 }), true);
    assert.equal(depositSatisfied({ depositCents: 145_000, amountPaidCents: 144_999 }), false);
    assert.equal(depositSatisfied({ depositCents: 145_000, amountPaidCents: 145_000 }), true);
  });
});
