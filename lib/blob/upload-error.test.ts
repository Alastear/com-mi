import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toUploadError, uploadErrorStatus } from "./upload-error";

/**
 * รหัสที่ route ออก token อัปโหลดตอบกลับ — ใช้ร่วมกันทั้ง /api/blob/upload และ /api/blob/delivery-upload
 *
 * เดิม /api/blob/upload ตอบ 400 ทุกกรณี พร้อมข้อความดิบจาก SDK: Blob ล่มจริงดูเหมือนผู้ใช้ส่งผิด
 * และข้อความภายในหลุดไปถึงเบราว์เซอร์
 */
describe("toUploadError", () => {
  it("รหัสที่เราโยนเองผ่านไปตามเดิม", () => {
    for (const code of ["bad_request", "forbidden", "invalid_state", "storage_quota_exceeded"]) {
      assert.equal(toUploadError(new Error(code)), code);
    }
  });

  it("ข้อความอื่นทั้งหมดจาก SDK/DB กลายเป็น upload_failed — ไม่หลุดข้อความดิบ", () => {
    for (const raw of [
      "Vercel Blob: No token found. Either configure the `BLOB_READ_WRITE_TOKEN` environment variable",
      "connect ECONNREFUSED",
      "Invalid event type",
      "",
    ]) {
      assert.equal(toUploadError(new Error(raw)), "upload_failed", raw);
    }
  });

  it("ของที่ไม่ใช่ Error ก็เป็น upload_failed", () => {
    assert.equal(toUploadError("forbidden"), "upload_failed");
    assert.equal(toUploadError(null), "upload_failed");
    assert.equal(toUploadError({ message: "forbidden" }), "upload_failed");
  });

  it("ชื่อ property ของ Object ไม่หลุดเป็นรหัส", () => {
    // `"toString" in {}` เป็นจริง — ถ้าเช็คด้วย `in` ข้อความพวกนี้จะผ่านออกไป
    for (const raw of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      assert.equal(toUploadError(new Error(raw)), "upload_failed", raw);
    }
  });
});

describe("uploadErrorStatus", () => {
  it("ผู้เรียกผิด = 4xx, ระบบเราพัง = 500", () => {
    assert.equal(uploadErrorStatus("bad_request"), 400);
    assert.equal(uploadErrorStatus("forbidden"), 403);
    assert.equal(uploadErrorStatus("invalid_state"), 403);
    assert.equal(uploadErrorStatus("storage_quota_exceeded"), 403);
    assert.equal(uploadErrorStatus("upload_failed"), 500);
  });
});
