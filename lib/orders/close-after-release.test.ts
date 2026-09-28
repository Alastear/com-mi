import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allowedNext, canTransition, needsRelease, requiresAction } from "./state-machine";
import { actionLabel, isPrimaryAction } from "./labels";
import { consumesRevision } from "./revisions";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * ลูกค้าปิดงานระหว่างรอบแก้ด้วยไฟล์ที่ได้ไปแล้ว — ทางออกจากการที่ครีเอเตอร์กด "เปิดรอบแก้" แล้วเงียบ
 * (เหตุผลเต็มอยู่ที่ `CLIENT_CLOSES_AFTER_RELEASE` ใน state-machine.ts)
 */
const REWORK = ["in_progress", "in_review", "revision_requested"] as const;
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("ลูกค้าปิดงานหลังเคยได้ไฟล์", () => {
  it("ครีเอเตอร์เปิดรอบแก้แล้ว ลูกค้ายังไปถึง completed ได้ — ทุกสถานะที่ครีเอเตอร์พาไปต่อได้", () => {
    for (const from of REWORK) {
      assert.equal(canTransition(from, "completed", "client"), true, from);
      assert.equal(needsRelease(from, "completed", "client"), true, from);
      assert.ok(allowedNext(from, "client", { released: true }).includes("completed"), from);
      // ปุ่มธรรมดา ไม่ใช่ action เฉพาะ — `transitionOrder` เขียนเองพร้อมด่าน released
      assert.equal(requiresAction(from, "completed", "client"), null, from);
    }
  });

  it("ยังไม่เคยได้ไฟล์ = ไม่มีปุ่ม (ช่วง WIP ก่อนส่งจริง ห้ามปิดงานที่ไม่มีไฟล์สักไฟล์)", () => {
    for (const from of REWORK) {
      assert.equal(allowedNext(from, "client").includes("completed"), false, from);
      assert.equal(allowedNext(from, "client", { released: false }).includes("completed"), false, from);
    }
  });

  it("ครีเอเตอร์ปิดงานเองไม่ได้ และเส้นปกติจาก delivered ไม่ต้องมีด่าน released", () => {
    for (const from of REWORK) {
      assert.equal(canTransition(from, "completed", "creator"), false, from);
      assert.equal(allowedNext(from, "creator", { released: true }).includes("completed"), false, from);
    }
    assert.equal(needsRelease("delivered", "completed", "client"), false);
    assert.ok(allowedNext("delivered", "client").includes("completed"));
  });

  it("ไม่กินสิทธิ์แก้", () => {
    assert.equal(consumesRevision("completed", "client"), false);
  });

  it("ปุ่มบอกว่าปิดด้วยไฟล์ที่ได้แล้ว และไม่เป็นปุ่มหลัก — ทั้งสองภาษา", () => {
    for (const locale of ["th", "en"] as const) {
      const t = getDictionary(locale);
      for (const from of REWORK) {
        assert.equal(actionLabel(t, "completed", "client", from), t.orderAction.closeWithReleased);
        assert.equal(isPrimaryAction("completed", from), false, from);
      }
      assert.equal(actionLabel(t, "completed", "client", "delivered"), t.orderAction.markComplete);
      assert.equal(isPrimaryAction("completed", "delivered"), true);
      assert.ok(t.orderAction.closeWithReleasedConfirm.length > 0);
    }
  });

  it("ด่านจริงอยู่ใน WHERE ของ UPDATE ใน transitionOrder", () => {
    const src = read("lib/orders/actions.ts");
    assert.match(src, /const afterRelease = needsRelease\(from, to, actor\)/);
    assert.match(src, /select 1 from delivery d where d\.order_id = \$\{order\.id\} and d\.released_at is not null/);
    assert.match(src, /afterRelease \? releasedSql : undefined,/);
  });

  it("ประวัติร้าน: ชุดที่ถอนเองทุกชุดไม่ตกไปใช้ event ส่งมอบแรก (ได้ 'ตรงเวลา' ฟรี)", () => {
    const src = read("lib/queries/reputation.ts");
    assert.match(
      src,
      /when exists \(select 1 from delivery d where d\.order_id = o\.id and d\.released_at is not null\)\s+then o\.completed_at/,
    );
  });
});
