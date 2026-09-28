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
        const text = notificationText(t, type, { code: "K7M2QX4P", status: "in_progress", days: 2 });
        assert.ok(text, `${type} ขาดข้อความภาษา ${name}`);
        assert.equal(/\{\w+\}/.test(text!), false, `${type} (${name}) เหลือ placeholder ที่ไม่ถูกแทน`);
      }
    }
  });

  it("แทนค่าลงในข้อความถูกตำแหน่ง", () => {
    assert.match(notificationText(th, "order_message", { code: "ABCD2345" })!, /ABCD2345/);
    assert.match(notificationText(en, "order_created", { code: "ABCD2345" })!, /ABCD2345/);
  });

  it("สถานะใหม่มาจาก `to` — รูปเดียวกับที่ transitionOrder เก็บจริง", () => {
    // ⚠️ เทสต์เดิมส่ง `status` มาเอง ซึ่งไม่มีผู้เรียกคนไหนส่ง จึงผ่านทั้งที่กระดิ่งขึ้นท้ายว่าง
    const real = { code: "ABCD2345", from: "requested", to: "accepted" };
    const text = notificationText(en, "order_status_changed", real)!;
    assert.match(text, /ABCD2345/);
    assert.match(text, /Accepted/i);
    assert.equal(text.trimEnd().endsWith("is now"), false, "ต้องไม่จบด้วยช่องว่าง");
    assert.match(notificationText(th, "order_status_changed", real)!, /รับงานแล้ว/);
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

  it("ลูกค้าปิดงานระหว่างรอบแก้: กระดิ่งบอกว่าไม่ต้องส่งรอบแก้ ไม่ใช่แค่ 'เปลี่ยนเป็นเสร็จสมบูรณ์'", () => {
    for (const t of [th, en]) {
      const early = notificationText(t, "order_status_changed", {
        code: "ABCD2345",
        from: "revision_requested",
        to: "completed",
      })!;
      assert.equal(early, t.notification.orderClosedEarly.replace("{code}", "ABCD2345"));
      // กดรับงานที่ส่งมอบแล้ว / แถวเก่าที่ไม่มี from = ข้อความเดิม
      const normals: Record<string, string>[] = [
        { code: "ABCD2345", from: "delivered", to: "completed" },
        { code: "ABCD2345", to: "completed" },
      ];
      for (const data of normals) {
        const normal = notificationText(t, "order_status_changed", data)!;
        const expected = t.notification.order_status_changed
          .replace("{code}", "ABCD2345")
          .replace("{status}", t.orderStatus.completed);
        assert.equal(normal, expected);
      }
    }
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
