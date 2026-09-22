import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickDeliveryFor } from "./read";

/**
 * กฎการเลือกแถวส่งมอบตอนออก URL ดาวน์โหลด
 *
 * บั๊กที่เทสต์นี้กันไว้เกิดขึ้นจริงหลัง de158c5: หน้าจอวาดปุ่มโหลดให้ไฟล์ทุกรอบ
 * ที่ปล่อยแล้ว แต่ตัวออก URL ยังเลือก "แถวล่าสุด" แถวเดียว — พอมีรอบสองที่ยังไม่ปล่อย
 * ไฟล์รอบแรกที่ลูกค้าจ่ายแล้วกดโหลดได้ `not_found` และมีคนบอกว่า "ทั้งสองรอบใช้ได้"
 * โดยดูแค่ว่าปุ่มขึ้น ไม่ได้กด
 */
const released = (id: string, ...mediaIds: string[]) => ({
  id,
  mediaIds,
  releasedAt: new Date("2026-09-01T00:00:00Z"),
});
const open = (id: string, ...mediaIds: string[]) => ({ id, mediaIds, releasedAt: null });

describe("pickDeliveryFor", () => {
  it("ไฟล์รอบแรกยังเลือกได้แม้รอบสองที่ยังไม่ปล่อยเป็นแถวล่าสุด", () => {
    // เรียงใหม่สุดก่อน เหมือน query จริง (orderBy desc createdAt)
    const rows = [open("d2", "m2"), released("d1", "m1")];
    assert.equal(pickDeliveryFor(rows, "m1")?.id, "d1");
  });

  it("ไฟล์ในรอบที่ยังไม่ปล่อยได้แถวนั้นคืน — เพื่อให้ตอบ not_released ไม่ใช่ not_found", () => {
    const rows = [open("d2", "m2"), released("d1", "m1")];
    const pick = pickDeliveryFor(rows, "m2");
    assert.equal(pick?.id, "d2");
    assert.equal(pick?.releasedAt, null);
  });

  it("ไฟล์ที่อยู่ทั้งรอบที่ปล่อยแล้วและรอบที่ยังไม่ปล่อย เลือกรอบที่ปล่อยแล้ว", () => {
    // ครีเอเตอร์ส่งไฟล์เดิมซ้ำในรอบแก้ — สิทธิ์โหลดต้องมาจากรอบที่จ่ายแล้ว
    const rows = [open("d2", "m1", "m3"), released("d1", "m1")];
    assert.equal(pickDeliveryFor(rows, "m1")?.id, "d1");
  });

  it("ไฟล์ที่ไม่เคยถูกผูกกับรอบไหนเลยคืน null", () => {
    const rows = [open("d2", "m2"), released("d1", "m1")];
    assert.equal(pickDeliveryFor(rows, "m9"), null);
  });

  it("ไม่มีรอบเลยคืน null", () => {
    assert.equal(pickDeliveryFor([], "m1"), null);
  });

  it("รอบเดียวยังทำงานเหมือนเดิม", () => {
    assert.equal(pickDeliveryFor([released("d1", "m1", "m2")], "m2")?.id, "d1");
    assert.equal(pickDeliveryFor([released("d1", "m1")], "m2"), null);
  });
});
