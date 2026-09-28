import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRetryableStatus,
  MAX_PART_ATTEMPTS,
  retryDelayMs,
  stopsBatch,
  uploadFailure,
} from "./errors";

describe("รหัสความล้มเหลวของการอัปโหลด", () => {
  it("รหัสที่ผู้ใช้ต้องรู้เรื่องแยกออกมาครบ", () => {
    assert.equal(uploadFailure("storage_quota_exceeded"), "quota");
    assert.equal(uploadFailure("too_large"), "too_large");
    assert.equal(uploadFailure("rate_limited"), "rate_limited");
    assert.equal(uploadFailure("invalid_state"), "invalid_state");
    assert.equal(uploadFailure("empty_file"), "empty");
  });

  it("รหัสอื่นทั้งหมด (รวมข้อความที่ Next ซ่อนไว้) เป็น failed", () => {
    for (const code of ["", "put_403", "upload_failed", "forbidden", "retry", "An error occurred in the Server Components render."]) {
      assert.equal(uploadFailure(code), "failed");
    }
  });

  it("หยุดทั้งชุดเฉพาะเหตุที่ไฟล์ถัดไปจะล้มเหมือนกันแน่", () => {
    assert.equal(stopsBatch("quota"), true);
    assert.equal(stopsBatch("rate_limited"), true);
    assert.equal(stopsBatch("invalid_state"), true);
    // เหตุเฉพาะไฟล์ — ไฟล์อื่นในชุดยังอัปได้
    assert.equal(stopsBatch("too_large"), false);
    assert.equal(stopsBatch("empty"), false);
    assert.equal(stopsBatch("failed"), false);
  });
});

describe("การลองซ้ำของชิ้นไฟล์", () => {
  it("รอนานขึ้นทีละเท่า แล้วคงที่ 30 วินาที", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(retryDelayMs), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it("รอรวมทั้งหมดเกินหนึ่งนาที — เน็ตมือถือหลุดสั้น ๆ ต้องไม่ทำให้ทั้งไฟล์ล้ม", () => {
    let total = 0;
    for (let a = 1; a < MAX_PART_ATTEMPTS; a++) total += retryDelayMs(a);
    assert.ok(total >= 60_000, `total ${total}`);
  });

  it("ลองซ้ำเฉพาะสถานะที่มีโอกาสผ่าน", () => {
    for (const s of [500, 502, 503, 408, 429]) assert.equal(isRetryableStatus(s), true, String(s));
    // URL หมดอายุ / ขนาดไม่ตรง / ไม่มี upload แล้ว — ลองกี่ครั้งก็เหมือนเดิม
    for (const s of [400, 403, 404, 412]) assert.equal(isRetryableStatus(s), false, String(s));
  });
});
