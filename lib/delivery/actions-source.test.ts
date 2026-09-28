import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ด่านใน SQL ของ lib/delivery/actions.ts ต้องมี DB ถึงจะรันจริงได้ และไฟล์นั้น import "server-only"
 * เทสต์ตรงนี้จึงตรวจที่ตัวโค้ด — กันไม่ให้ด่านที่แก้ไปแล้วถูกใส่กลับ/หายไปเงียบ ๆ
 */
const src = readFileSync(join(process.cwd(), "lib/delivery/actions.ts"), "utf8");

function body(name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, name);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("เอาไฟล์ออกจากรอบที่ยังไม่ปล่อย", () => {
  it("ไม่มีด่านสถานะออเดอร์ — รอบที่ค้างตอนงานปิดต้องเอาออก (แล้วลบคืนพื้นที่) ได้", () => {
    const fn = body("takeOutOfRound");
    assert.doesNotMatch(fn, /canUploadDelivery\(/);
    assert.doesNotMatch(fn, /orderAcceptsFilesSql\(/);
  });

  it("ยังแตะได้เฉพาะรอบที่ยังไม่ปล่อย ใต้ lock ของออเดอร์", () => {
    const fn = body("takeOutOfRound");
    assert.match(fn, /lockOrder\(order\.id\)/);
    assert.match(fn, /update delivery d set media_ids = d\.media_ids - \$\{mediaId\}::text\s+where d\.order_id = \$\{order\.id\} and d\.released_at is null/);
  });
});

describe("ส่งมอบ + ปล่อยไฟล์", () => {
  it("event ส่งมอบอยู่ใน batch เดียวกับการปล่อย (มีแถวเฉพาะเมื่อเพิ่งปล่อยจริง) ไม่ใช่คำสั่งตามหลัง", () => {
    const fn = body("deliverAndRelease");
    assert.match(fn, /where exists \(select 1 from delivery d where d\.id = \$\{dlv\.id\} and d\.released_at = \$\{at\}::timestamptz\)/);
    assert.match(fn, /db\.batch\(\[lockOrder\(order\.id\), release, event\]\)/);
    assert.match(fn, /db\.batch\(\[lockOrder\(order\.id\), flip, release, event\]\)/);
    // ห้ามมี insert event หลัง batch อีก — ล้มตรงนั้นแล้วซ่อมไม่ได้
    assert.doesNotMatch(fn, /db\.insert\(schema\.message\)/);
  });
});
