import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkReportAmount,
  dueNowCents,
  fitsUnderTotal,
  isWholeBaht,
  outstandingCents,
  parseBaht,
  paymentState,
  toBahtInput,
  verifiedSum,
} from "./money";

/**
 * ⚠️ ชุดนี้คุมตัวเลขที่ตัดสินว่าไฟล์งานปลดล็อกหรือยัง
 * บั๊กที่นี่ = ครีเอเตอร์เสียงานโดยได้เงินไม่ครบ หรือลูกค้าจ่ายครบแล้วโหลดไม่ได้
 */

const at = new Date("2026-09-01T00:00:00Z");

describe("สถานะของรายการชำระ", () => {
  it("ยังไม่มีใครตอบ = รอยืนยัน", () => {
    assert.equal(paymentState({ verifiedAt: null, rejectedAt: null, voidedAt: null }), "pending");
  });

  it("ยืนยันแล้ว = นับเป็นเงิน", () => {
    assert.equal(paymentState({ verifiedAt: at, rejectedAt: null, voidedAt: null }), "verified");
  });

  it("ปฏิเสธแล้ว = ไม่นับ", () => {
    assert.equal(paymentState({ verifiedAt: null, rejectedAt: at, voidedAt: null }), "rejected");
  });

  it("ยกเลิกการยืนยันแล้วต้องไม่ถูกนับ แม้ verifiedAt ยังอยู่", () => {
    // แถว void เก็บ verifiedAt ไว้เป็นหลักฐาน — ถ้าเช็ค verified ก่อนจะนับเงินที่ถูกยกเลิก
    assert.equal(paymentState({ verifiedAt: at, rejectedAt: null, voidedAt: at }), "voided");
  });

  it("รับค่าเป็น ISO string ได้ (ฝั่ง client ได้ Date มาแบบนี้)", () => {
    assert.equal(
      paymentState({ verifiedAt: at.toISOString(), rejectedAt: null, voidedAt: null }),
      "verified",
    );
  });
});

describe("ยอดที่ยืนยันแล้ว", () => {
  it("นับเฉพาะ verified", () => {
    const rows = [
      { amountCents: 100_000, state: "verified" as const },
      { amountCents: 100_000, state: "pending" as const },
      { amountCents: 100_000, state: "rejected" as const },
      { amountCents: 100_000, state: "voided" as const },
      { amountCents: 50_000, state: "verified" as const },
    ];
    assert.equal(verifiedSum(rows), 150_000);
  });

  it("ไม่มีรายการ = 0", () => {
    assert.equal(verifiedSum([]), 0);
  });
});

describe("ยอดคงค้างและยอดรอบนี้", () => {
  it("คงค้าง = ราคา − ที่ได้รับ", () => {
    assert.equal(outstandingCents({ totalCents: 300_000, amountPaidCents: 100_000 }), 200_000);
  });

  it("คงค้างไม่ติดลบ แม้ข้อมูลเก่าได้รับเกินราคา", () => {
    assert.equal(outstandingCents({ totalCents: 300_000, amountPaidCents: 400_000 }), 0);
  });

  it("ยังไม่ถึงมัดจำ = โอนแค่ส่วนที่ขาดของมัดจำ", () => {
    assert.equal(
      dueNowCents({ totalCents: 300_000, amountPaidCents: 0, depositCents: 150_000 }),
      150_000,
    );
    assert.equal(
      dueNowCents({ totalCents: 300_000, amountPaidCents: 100_000, depositCents: 150_000 }),
      50_000,
    );
  });

  it("ถึงมัดจำแล้ว = ยอดคงค้างทั้งหมด", () => {
    assert.equal(
      dueNowCents({ totalCents: 300_000, amountPaidCents: 150_000, depositCents: 150_000 }),
      150_000,
    );
  });

  it("ไม่บังคับมัดจำ = ยอดคงค้างทั้งหมด", () => {
    assert.equal(
      dueNowCents({ totalCents: 300_000, amountPaidCents: 0, depositCents: 0 }),
      300_000,
    );
  });

  it("มัดจำเกินราคา (ข้อมูลเก่า) ไม่ขอเงินเกินราคางาน", () => {
    assert.equal(
      dueNowCents({ totalCents: 100_000, amountPaidCents: 0, depositCents: 150_000 }),
      100_000,
    );
  });

  it("จ่ายครบแล้ว = 0", () => {
    assert.equal(
      dueNowCents({ totalCents: 300_000, amountPaidCents: 300_000, depositCents: 150_000 }),
      0,
    );
  });
});

describe("ยอดที่ลูกค้าแจ้ง", () => {
  it("1 สตางค์ถึงยอดคงค้างผ่าน", () => {
    assert.equal(checkReportAmount(1, 200_000), "ok");
    assert.equal(checkReportAmount(200_000, 200_000), "ok");
  });

  it("เกินยอดคงค้างไม่ผ่าน — แจ้งทีเดียวให้ครบทั้งที่โอนไม่ถึงไม่ได้", () => {
    assert.equal(checkReportAmount(200_001, 200_000), "over_outstanding");
  });

  it("ศูนย์ ติดลบ ทศนิยม ไม่ผ่าน", () => {
    assert.equal(checkReportAmount(0, 200_000), "invalid");
    assert.equal(checkReportAmount(-100, 200_000), "invalid");
    assert.equal(checkReportAmount(1.5, 200_000), "invalid");
    assert.equal(checkReportAmount(Number.NaN, 200_000), "invalid");
  });

  it("จ่ายครบแล้วแจ้งเพิ่มไม่ได้", () => {
    assert.equal(checkReportAmount(100, 0), "over_outstanding");
  });
});

describe("เพดานตอนยืนยัน", () => {
  it("ยืนยันแล้วพอดีราคางานได้", () => {
    assert.equal(fitsUnderTotal(150_000, 150_000, 300_000), true);
  });

  it("แจ้งซ้ำสองแถว ยืนยันแถวที่สองไม่ได้ — ช่องโหว่เดิมที่ปิด", () => {
    // ลูกค้าโอนมัดจำ ฿1,500 แต่กดแจ้งสองครั้ง ครีเอเตอร์ยืนยันแถวแรกไปแล้ว
    // แถวที่สอง (฿1,500 เดิม) + ที่ยืนยันแล้วยังไม่เกิน ฿3,000 จึงผ่าน —
    // ด่านนี้กันได้เฉพาะยอดที่เกินราคา ส่วนการแจ้งซ้ำกันด้วยกติกา "มีรายการรออยู่แล้วแจ้งเพิ่มไม่ได้"
    assert.equal(fitsUnderTotal(150_000, 150_000, 300_000), true);
    // แจ้งยอดเต็มสองครั้ง: แถวที่สองจะดันยอดไปเป็น ฿6,000 — ต้องไม่ผ่าน
    assert.equal(fitsUnderTotal(300_000, 300_000, 300_000), false);
  });

  it("เกินแม้หนึ่งสตางค์ก็ไม่ผ่าน", () => {
    assert.equal(fitsUnderTotal(150_001, 150_000, 300_000), false);
  });
});

describe("ช่องกรอกเงินเป็นบาทเต็ม", () => {
  it("แปลงบาทเป็นสตางค์", () => {
    assert.equal(parseBaht("1500"), 150_000);
    assert.equal(parseBaht(" 1 "), 100);
  });

  it("ไม่เดาจากรูปแบบอื่น — ทศนิยม คอมมา ติดลบ ศูนย์ ว่าง", () => {
    for (const bad of ["", "0", "1500.50", "1,500", "-5", "abc", "1e3", "12345678"]) {
      assert.equal(parseBaht(bad), null, `"${bad}" ต้องไม่ผ่าน`);
    }
  });

  it("ค่าตั้งต้นปัดลง จะได้ไม่เกินยอดคงค้าง", () => {
    assert.equal(toBahtInput(150_000), "1500");
    assert.equal(toBahtInput(150_050), "1500");
    assert.equal(toBahtInput(0), "");
  });
});

describe("ยอดที่ server รับ ต้องเป็นบาทเต็ม", () => {
  it("บาทเต็มผ่าน", () => {
    assert.equal(isWholeBaht(100), true);
    assert.equal(isWholeBaht(299_900), true);
  });

  it("เศษสตางค์ไม่ผ่าน — ยืนยันแล้วจะเหลือยอดค้างที่ไม่มีฟอร์มไหนจ่ายได้", () => {
    for (const bad of [50, 299_950, 1, 101]) {
      assert.equal(isWholeBaht(bad), false, `${bad} ต้องไม่ผ่าน`);
    }
  });

  it("ทุกยอดที่ช่องกรอกสร้างได้ ผ่านด่าน server เสมอ", () => {
    // สองด่านต้องไม่เพี้ยนกัน ไม่งั้นช่องกรอกบอกว่าถูกแต่ server ตอบ invalid
    for (const raw of ["1", "1500", "9999999"]) {
      const cents = parseBaht(raw);
      assert.ok(cents !== null && isWholeBaht(cents), raw);
    }
  });
});
