import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEPOSIT_PERCENTS,
  depositFor,
  depositPercentOf,
  depositSummary,
} from "./pricing";
import { starterTos } from "@/lib/templates/starter-shop";

describe("depositSummary — มัดจำที่ฟอร์มสั่งงานโชว์", () => {
  it("0% หรือไม่มีเปอร์เซ็นต์ = ไม่มีมัดจำ", () => {
    assert.deepEqual(depositSummary(80_000, 0), { kind: "none" });
    assert.deepEqual(depositSummary(80_000, -10), { kind: "none" });
    assert.deepEqual(depositSummary(80_000, Number.NaN), { kind: "none" });
  });

  it("ยอดรวมศูนย์หรือติดลบไม่มีมัดจำ", () => {
    assert.deepEqual(depositSummary(0, 50), { kind: "none" });
    assert.deepEqual(depositSummary(-100, 50), { kind: "none" });
  });

  it("บางส่วน = deposit พร้อมยอดที่ตรงกับ depositFor เป๊ะ", () => {
    assert.deepEqual(depositSummary(80_000, 50), { kind: "deposit", cents: 40_000 });
    assert.deepEqual(depositSummary(150_000, 25), { kind: "deposit", cents: 37_500 });
    // ⚠️ ตัวเลขบนฟอร์มต้องเท่ากับที่ createOrder เขียนลงออเดอร์ทุกกรณี
    for (const total of [100, 4_500, 33_300, 80_000, 123_400, 999_900]) {
      for (const pct of DEPOSIT_PERCENTS) {
        const s = depositSummary(total, pct);
        const expected = depositFor(total, pct);
        assert.equal(s.kind === "none" ? 0 : s.cents, expected, `${total} @ ${pct}%`);
      }
    }
  });

  it("100% = full ไม่ใช่ deposit — ไม่มี 'ส่วนที่เหลือ' ให้พูดถึง", () => {
    assert.deepEqual(depositSummary(80_000, 100), { kind: "full", cents: 80_000 });
    // ค่าเกิน 100 ถูกปัดลงที่ depositFor
    assert.deepEqual(depositSummary(80_000, 250), { kind: "full", cents: 80_000 });
  });

  it("ยอดน้อยที่ปัดแล้วเต็มยอด นับเป็น full ตามเงินจริง ไม่ใช่ตามเปอร์เซ็นต์", () => {
    // ฿1 ที่ 50% = 50 สตางค์ ปัดเป็นบาทได้ ฿1 เต็มยอด
    assert.deepEqual(depositSummary(100, 50), { kind: "full", cents: 100 });
  });
});

describe("depositPercentOf — กู้ปุ่มเปอร์เซ็นต์คืนจากเงิน", () => {
  it("คืนปุ่มเดิมสำหรับยอดปกติทุกปุ่ม", () => {
    for (const total of [45_000, 80_000, 150_000, 123_400]) {
      for (const pct of DEPOSIT_PERCENTS) {
        assert.equal(depositPercentOf(depositFor(total, pct), total), pct, `${total} @ ${pct}%`);
      }
    }
  });

  it("ค่าเพี้ยนคืน 0 ไม่ใช่ NaN หรือ Infinity", () => {
    assert.equal(depositPercentOf(40_000, 0), 0);
    assert.equal(depositPercentOf(40_000, -1), 0);
    assert.equal(depositPercentOf(0, 80_000), 0);
    assert.equal(depositPercentOf(Number.NaN, 80_000), 0);
    assert.equal(depositPercentOf(40_000, Number.POSITIVE_INFINITY), 0);
  });

  it("ข้อมูลเก่าที่มัดจำเกินยอดรวมไม่เกิน 100", () => {
    assert.equal(depositPercentOf(200_000, 80_000), 100);
  });
});

describe("มัดจำของออเดอร์จากเมนู", () => {
  it("createOrder คิดมัดจำจากเปอร์เซ็นต์ของเมนูแล้วส่งให้ insertNewOrder", () => {
    /**
     * ตรวจที่ตัวโค้ด เพราะลืมข้อนี้แล้วไม่มีอะไรพัง — ออเดอร์เกิดปกติแค่มัดจำเป็น 0
     * แล้วด่าน `depositSatisfied()` ก็เปิดให้เริ่มงานโดยไม่มีเงินเข้า ซึ่งคือรูที่เพิ่งอุด
     */
    const src = readFileSync(join(process.cwd(), "lib/orders/create.ts"), "utf8");
    assert.match(src, /depositFor\(quote\.totalCents, service\.depositPercent\)/);
    assert.match(src, /quote: \{ \.\.\.quote, depositCents \}/);
  });

  it("ฟอร์มสั่งงานโชว์มัดจำด้วยสูตรเดียวกัน", () => {
    const src = readFileSync(join(process.cwd(), "components/service-order-flow.tsx"), "utf8");
    assert.match(src, /depositSummary\(total, service\.depositPercent\)/);
  });
});

describe("ร่างข้อตกลงตั้งต้น", () => {
  it("ข้อมัดจำไม่ระบุเปอร์เซ็นต์ — ตัวเลขจริงอยู่ที่เมนู", () => {
    /**
     * ร่างเดิมเขียน "มัดจำ 50%" ทั้งที่เมนูเริ่มที่ 0 — ข้อตกลงขัดกับระบบตั้งแต่วันแรก
     * ห้ามกลับไปใส่ตัวเลขอีก ไม่ว่าภาษาไหน
     */
    for (const locale of ["th", "en"] as const) {
      for (const line of starterTos(locale)) {
        assert.doesNotMatch(line, /\d+\s*%/, `${locale}: ${line}`);
      }
    }
  });
});
