import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notificationText } from "./labels";
import { NOTIFICATION_TYPES } from "./types";
import { getDictionary } from "@/lib/i18n/dictionaries";

const th = getDictionary("th");
const en = getDictionary("en");

describe("ข้อความแจ้งเตือน", () => {
  it("ทุกชนิดต้องมีข้อความครบทั้งสองภาษา", () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const [name, t] of [["th", th], ["en", en]] as const) {
        const text = notificationText(t, type, { code: "K7M2QX4P", status: "in_progress" });
        assert.ok(text, `${type} ขาดข้อความภาษา ${name}`);
        assert.equal(/\{\w+\}/.test(text!), false, `${type} (${name}) เหลือ placeholder ที่ไม่ถูกแทน`);
      }
    }
  });

  it("แทนค่าลงในข้อความถูกตำแหน่ง", () => {
    assert.match(notificationText(th, "order_message", { code: "ABCD2345" })!, /ABCD2345/);
    assert.match(notificationText(en, "order_created", { code: "ABCD2345" })!, /ABCD2345/);
  });

  it("สถานะถูกแปล ไม่ใช่โชว์ค่าดิบจาก DB", () => {
    const text = notificationText(en, "order_status_changed", {
      code: "ABCD2345",
      status: "in_progress",
    })!;
    assert.equal(text.includes("in_progress"), false, "ต้องไม่โชว์ค่าดิบ");
    assert.match(text, /In progress/i);

    const thai = notificationText(th, "order_status_changed", {
      code: "ABCD2345",
      status: "in_progress",
    })!;
    assert.match(thai, /กำลังทำ/);
  });

  it("ชนิดที่ไม่รู้จักคืน null — ไม่โชว์ key ดิบให้ผู้ใช้เห็น", () => {
    assert.equal(notificationText(th, "ยังไม่มีชนิดนี้", {}), null);
  });

  it("ข้อมูลที่ขาดหายไม่ทำให้ขึ้น undefined บนหน้าจอ", () => {
    const text = notificationText(en, "order_message", {})!;
    assert.equal(text.includes("undefined"), false);
    assert.equal(/\{\w+\}/.test(text), false);
  });
});
