import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attachmentDisposition,
  MAX_DELIVERY_BYTES,
  PART_SIZE,
  partPlan,
  publicKey,
  publicUrlFor,
  safeContentType,
} from "./keys";

describe("ตัดไฟล์เป็นชิ้น", () => {
  it("ผลรวมของชิ้นเท่ากับขนาดไฟล์พอดี", () => {
    for (const bytes of [1, PART_SIZE - 1, PART_SIZE, PART_SIZE + 1, 3 * PART_SIZE + 17]) {
      const sizes = partPlan(bytes);
      assert.equal(sizes.reduce((a, b) => a + b, 0), bytes);
    }
  });

  it("ทุกชิ้นยกเว้นชิ้นสุดท้ายเท่ากับ PART_SIZE — R2 ปฏิเสธชิ้นกลางที่เล็กกว่า 5 MiB", () => {
    const sizes = partPlan(3 * PART_SIZE + 17);
    assert.deepEqual(sizes, [PART_SIZE, PART_SIZE, PART_SIZE, 17]);
  });

  it("ไฟล์ขนาดพอดีชิ้นไม่มีชิ้นว่างต่อท้าย", () => {
    assert.deepEqual(partPlan(2 * PART_SIZE), [PART_SIZE, PART_SIZE]);
  });

  it("ขนาดที่ไม่ใช่จำนวนเต็มบวกไม่ได้ชิ้นเลย", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(partPlan(bad), []);
    }
  });

  it("ไฟล์ใหญ่สุดที่รับได้ยังไม่เกิน 10,000 ชิ้นของ S3 และบันทึกลง integer ได้", () => {
    assert.ok(partPlan(MAX_DELIVERY_BYTES).length <= 10_000);
    assert.ok(MAX_DELIVERY_BYTES <= 2_147_483_647);
  });
});

describe("key และ URL ของไฟล์สาธารณะ", () => {
  it("ใส่นามสกุลตามชนิดไฟล์ที่รู้จัก", () => {
    assert.equal(publicKey("portfolio", "abc", "image/webp"), "portfolio/abc.webp");
    assert.equal(publicKey("portfolio", "abc", "video/quicktime"), "portfolio/abc.mov");
  });

  it("ชนิดที่ไม่รู้จักไม่เดานามสกุล", () => {
    assert.equal(publicKey("banner", "abc", "image/svg+xml"), "banner/abc");
  });

  it("base ที่มี / ต่อท้ายไม่ทำให้เกิด //", () => {
    assert.equal(publicUrlFor("https://m.example/", "a/b.webp"), "https://m.example/a/b.webp");
    assert.equal(publicUrlFor("https://m.example", "a/b.webp"), "https://m.example/a/b.webp");
  });
});

describe("ชนิดไฟล์ของไฟล์ส่งมอบ", () => {
  it("รับรูปแบบ type/subtype ปกติ", () => {
    assert.equal(safeContentType("image/vnd.adobe.photoshop"), "image/vnd.adobe.photoshop");
    assert.equal(safeContentType("Application/ZIP"), "application/zip");
  });

  it("ค่าว่างหรือค่าแปลกกลายเป็น octet-stream — กันแทรก header", () => {
    for (const bad of ["", "zip", "text/html\r\nx-evil: 1", "a/b c", "x".repeat(300) + "/y"]) {
      assert.equal(safeContentType(bad), "application/octet-stream");
    }
  });
});

describe("ชื่อไฟล์ตอนดาวน์โหลด", () => {
  it("ชื่อไทยไปทาง filename* และมีทางสำรอง ASCII", () => {
    assert.equal(
      attachmentDisposition("งาน.psd"),
      "attachment; filename=\"___.psd\"; filename*=UTF-8''%E0%B8%87%E0%B8%B2%E0%B8%99.psd",
    );
  });

  it("เครื่องหมายคำพูดและขึ้นบรรทัดถูกตัด — ปิดคำพูดก่อนเวลาไม่ได้", () => {
    const d = attachmentDisposition('a";evil=1\r\n.zip');
    assert.ok(!d.includes("\r") && !d.includes("\n"));
    assert.equal(d.split('"').length, 3);
  });

  it("ชื่อว่างใช้ค่ากลาง", () => {
    assert.match(attachmentDisposition("  "), /filename="download"/);
  });
});
