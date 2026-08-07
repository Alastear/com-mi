import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc16ccitt, isValidPayload, promptPayPayload } from "./promptpay";
import { formatPromptPayId, isValidPromptPayId, normalizePromptPayId } from "./promptpay-id";

/**
 * ⚠️ เทสต์ชุดนี้คุมโค้ดที่ถ้าผิดแล้ว "เงินของคนอื่นไปผิดบัญชี"
 *
 * แต่ต้องเข้าใจขอบเขต: มันยืนยันได้แค่ว่าเราสร้างสตริงตามสเปก EMVCo
 * **ไม่ได้ยืนยันว่าแอปธนาคารจริงอ่านแล้วขึ้นชื่อผู้รับถูกคน**
 * ก่อนปล่อยให้ครีเอเตอร์ใช้ ต้องมีคนสแกนด้วยแอปธนาคารจริงหนึ่งครั้ง
 */

describe("CRC-16/CCITT-FALSE", () => {
  it("ค่าตรวจมาตรฐานของอัลกอริทึม", () => {
    // ค่านี้เป็นตัวแยก CCITT-FALSE ออกจาก CRC-16 ตัวอื่นที่หน้าตาคล้ายกัน
    assert.equal(crc16ccitt("123456789"), 0x29b1);
  });

  it("ต่างจาก CRC-16 ตัวอื่นที่มักหยิบมาผิด", () => {
    assert.notEqual(crc16ccitt("123456789"), 0xbb3d); // ARC
    assert.notEqual(crc16ccitt("123456789"), 0x4b37); // MODBUS/XMODEM ที่ init ต่างกัน
  });
});

describe("payload ของ PromptPay", () => {
  /**
   * เดิน TLV จริงแทนการเทียบกับสตริงที่พิมพ์เอง
   *
   * golden string ที่ก็อปมาจากเอกสารแล้วพิมพ์ผิดหนึ่งตัวจะทำให้เทสต์แดง
   * ทั้งที่โค้ดถูก (เกิดขึ้นแล้วตอนเขียนไฟล์นี้) ส่วน parser พิสูจน์สิ่งที่สำคัญกว่า:
   * ทุกช่องอ่านออกครบจนหมดสตริง ไม่มีตกค้าง = ความยาวของทุกช่องถูกต้อง
   */
  function parseTlv(s: string): Map<string, string> {
    const out = new Map<string, string>();
    let i = 0;
    while (i < s.length) {
      const id = s.slice(i, i + 2);
      const len = Number(s.slice(i + 2, i + 4));
      assert.ok(Number.isInteger(len) && len > 0, `ความยาวของช่อง ${id} ต้องเป็นตัวเลข`);
      out.set(id, s.slice(i + 4, i + 4 + len));
      i += 4 + len;
    }
    assert.equal(i, s.length, "ต้องอ่านจบพอดี ไม่มีไบต์ตกค้าง");
    return out;
  }

  it("โครงสร้าง TLV อ่านออกครบทุกช่องจนจบสตริง", () => {
    const p = promptPayPayload({ type: "phone", id: "0000000000" });
    const f = parseTlv(p);

    assert.equal(f.get("00"), "01", "เวอร์ชัน payload");
    assert.equal(f.get("01"), "11", "ไม่มียอด = ใช้ซ้ำได้");
    assert.equal(f.get("53"), "764", "THB");
    assert.equal(f.get("58"), "TH");
    assert.equal(f.has("54"), false, "ไม่ควรมีช่องยอด");

    // ช่อง 29 เป็น TLV ซ้อนอีกชั้น
    const merchant = parseTlv(f.get("29")!);
    assert.equal(merchant.get("00"), "A000000677010111", "AID ของ PromptPay");
    assert.equal(merchant.get("01"), "0066000000000", "เบอร์ 0000000000 → 0066 + 9 หลัก");
    assert.equal(merchant.has("02"), false, "เบอร์ต้องไม่ไปอยู่ช่องเลขบัตร");

    assert.equal(isValidPayload(p), true);
  });

  it("ยอดเงินอยู่ในช่อง 54 และ TLV ยังอ่านจบพอดี", () => {
    const p = promptPayPayload({ type: "phone", id: "0812345678", amountSatang: 290_000 });
    const f = parseTlv(p);
    assert.equal(f.get("01"), "12", "มียอด = ใช้ครั้งเดียว");
    assert.equal(f.get("54"), "2900.00");
    assert.equal(parseTlv(f.get("29")!).get("01"), "0066812345678");
  });

  it("เบอร์จริงพร้อมยอดเงิน — โครงสร้างครบทุกช่อง", () => {
    const p = promptPayPayload({ type: "phone", id: "081-234-5678", amountSatang: 290_000 });
    assert.ok(p.startsWith("000201"), "เวอร์ชัน payload");
    assert.ok(p.includes("010212"), "QR แบบใช้ครั้งเดียวเมื่อมียอด");
    assert.ok(p.includes("0016A000000677010111"), "AID ของ PromptPay");
    assert.ok(p.includes("01130066812345678"), "เบอร์ถูกแปลงเป็น 0066 + 9 หลัก");
    assert.ok(p.includes("5303764"), "สกุลเงิน THB");
    assert.ok(p.includes("54072900.00"), "ยอด 2,900.00 บาท");
    assert.ok(p.includes("5802TH"), "ประเทศไทย");
    assert.equal(isValidPayload(p), true);
  });

  it("ขีดคั่นในเบอร์ไม่ทำให้ payload เปลี่ยน", () => {
    const a = promptPayPayload({ type: "phone", id: "0812345678", amountSatang: 100 });
    const b = promptPayPayload({ type: "phone", id: "081-234-5678", amountSatang: 100 });
    const c = promptPayPayload({ type: "phone", id: " 081 234 5678 ", amountSatang: 100 });
    assert.equal(a, b);
    assert.equal(b, c);
  });

  it("ไม่ระบุยอด = QR ใช้ซ้ำได้ และไม่มีช่อง 54", () => {
    const p = promptPayPayload({ type: "phone", id: "0812345678" });
    assert.ok(p.includes("010211"), "ใช้ซ้ำได้");
    assert.equal(/54\d{2}\d/.test(p.replace("5802TH", "")), false, "ไม่ควรมีช่องยอด");
  });

  it("เลขบัตรประชาชนใช้ sub-id 02 และไม่เติม 0066", () => {
    const p = promptPayPayload({ type: "national_id", id: "1234567890123" });
    assert.ok(p.includes("02131234567890123"));
    assert.equal(p.includes("0066"), false);
    assert.equal(isValidPayload(p), true);
  });

  it("ยอดเงินคำนวณจากสตางค์ล้วน ไม่มีเศษลอย", () => {
    const cases: [number, string][] = [
      [100, "1.00"],
      [105, "1.05"],
      [999, "9.99"],
      [30_000, "300.00"],
      [290_000, "2900.00"],
      [111_111, "1111.11"],
    ];
    for (const [satang, want] of cases) {
      const p = promptPayPayload({ type: "phone", id: "0812345678", amountSatang: satang });
      assert.ok(p.includes(`54${String(want.length).padStart(2, "0")}${want}`), `${satang} → ${want}`);
    }
  });

  it("CRC เปลี่ยนเมื่อยอดเปลี่ยน — กันการแก้ยอดกลางทาง", () => {
    const a = promptPayPayload({ type: "phone", id: "0812345678", amountSatang: 100_000 });
    const b = promptPayPayload({ type: "phone", id: "0812345678", amountSatang: 100_100 });
    assert.notEqual(a.slice(-4), b.slice(-4));
    // แก้ตัวเลขในสตริงโดยไม่คิด CRC ใหม่ ต้องตรวจจับได้
    assert.equal(isValidPayload(a.replace("1000.00", "1001.00")), false);
  });
});

describe("รูปแบบหมายเลข PromptPay", () => {
  it("รับเบอร์ 10 หลักที่ขึ้นต้นด้วย 0 เท่านั้น", () => {
    assert.equal(isValidPromptPayId("phone", "0812345678"), true);
    assert.equal(isValidPromptPayId("phone", "081-234-5678"), true);
    assert.equal(isValidPromptPayId("phone", "876584963"), false);
    assert.equal(isValidPromptPayId("phone", "08123456781"), false);
  });

  it("เลขบัตรต้อง 13 หลัก", () => {
    assert.equal(isValidPromptPayId("national_id", "1234567890123"), true);
    assert.equal(isValidPromptPayId("national_id", "123456789012"), false);
  });

  it("แสดงผลอ่านง่ายโดยไม่เปลี่ยนตัวเลข", () => {
    assert.equal(formatPromptPayId("phone", "0812345678"), "081-234-5678");
    assert.equal(normalizePromptPayId(formatPromptPayId("phone", "0812345678")), "0812345678");
  });
});
