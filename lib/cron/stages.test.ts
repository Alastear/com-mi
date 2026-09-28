import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planStages } from "./stages";

describe("planStages", () => {
  it("ไม่มีพารามิเตอร์ = รันทุกขั้น (cron จริงของ Vercel)", () => {
    assert.deepEqual(planStages(null, false), { ok: true, stages: ["media", "lifecycle"] });
  });

  it("มี code = รันเฉพาะ lifecycle ที่จำกัดออเดอร์ได้", () => {
    assert.deepEqual(planStages(null, true), { ok: true, stages: ["lifecycle"] });
    assert.deepEqual(planStages("lifecycle", true), { ok: true, stages: ["lifecycle"] });
  });

  it("code + only=media = ปฏิเสธ ไม่ใช่รันเก็บกวาดไฟล์ของผู้ใช้จริงทั้งระบบ", () => {
    assert.deepEqual(planStages("media", true), { ok: false, error: "media_not_scoped" });
  });

  it("only อย่างเดียวเลือกขั้นได้", () => {
    assert.deepEqual(planStages("media", false), { ok: true, stages: ["media"] });
    assert.deepEqual(planStages("lifecycle", false), { ok: true, stages: ["lifecycle"] });
  });

  it("ชื่อขั้นผิด = ปฏิเสธ (รวมตัวว่าง)", () => {
    assert.deepEqual(planStages("all", false), { ok: false, error: "bad_stage" });
    assert.deepEqual(planStages("", true), { ok: false, error: "bad_stage" });
  });
});
