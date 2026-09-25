import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventText } from "./labels";
import { getDictionary } from "@/lib/i18n/dictionaries";

const th = getDictionary("th");
const en = getDictionary("en");

describe("event เรื่องเงินบน timeline", () => {
  const types = [
    "payment_reported",
    "payment_recorded",
    "payment_confirmed",
    "payment_rejected",
    "payment_voided",
  ];

  it("ทุกชนิดมีข้อความทั้งสองภาษา และยอดถูกจัดรูปเป็นเงิน ไม่ใช่สตางค์ดิบ", () => {
    for (const type of types) {
      for (const [locale, t] of [["th", th], ["en", en]] as const) {
        const text = eventText(t, type, { actor: "creator", amount: 150_000 }, locale);
        assert.ok(text, `${type} (${locale}) ไม่มีข้อความ`);
        assert.match(text!, /1,500/, `${type} (${locale}) ต้องโชว์ ฿1,500`);
        assert.equal(text!.includes("150000"), false, "ห้ามโชว์สตางค์ดิบ");
        assert.equal(/\{\w+\}/.test(text!), false, "ห้ามเหลือ placeholder");
      }
    }
  });

  it("ยอดหายไม่ขึ้น NaN หรือ placeholder", () => {
    const text = eventText(th, "payment_voided", { actor: "creator" }, "th")!;
    assert.equal(text.includes("NaN"), false);
    assert.equal(/\{\w+\}/.test(text), false);
  });

  it("event ที่ไม่รู้จักยังคืน null เหมือนเดิม", () => {
    assert.equal(eventText(th, "payment_unknown", {}, "th"), null);
  });
});
