import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ออเดอร์ต้องเกิดได้ทางเดียว
 *
 * เทสต์นี้ตรวจโครงสร้างของโค้ด ไม่ใช่พฤติกรรมตอนรัน — เพราะกฎข้อนี้พังแบบเงียบ ๆ
 * ได้ง่ายมาก: คนเขียนฟีเจอร์ใหม่ที่ต้องสร้างออเดอร์จะ `insert` เองตรง ๆ เพราะมันสั้นกว่า
 * แล้วด่านทั้งหมด (ร้านถูกระงับ ร้านปิด โควตา แช่ TOS) จะหายไปพร้อมกันทีเดียว
 *
 * เหตุผลเต็มอยู่ใน `lib/orders/new-order.ts` และ `docs/06-quotes-and-invites.md` §4.5
 */

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) acc.push(full);
  }
  return acc;
}

describe("ทางสร้างออเดอร์", () => {
  it("มีที่เดียวในทั้งโปรเจกต์ที่ insert แถว order ได้", () => {
    const root = process.cwd();
    const files = [...sourceFiles(join(root, "lib")), ...sourceFiles(join(root, "app"))];
    const writers = files.filter((f) => readFileSync(f, "utf8").includes("insert(schema.order)"));

    assert.deepEqual(
      writers.map((f) => f.slice(root.length + 1)),
      ["lib/orders/new-order.ts"],
      "เจอทางสร้างออเดอร์ทางอื่น — ด่านใน assertCanAcceptNewOrder จะถูกข้ามไปทั้งชุด",
    );
  });
});

describe("มัดจำบนออเดอร์ใหม่", () => {
  it("ตัวเขียนต้องส่ง depositCents ลงแถว ไม่ใช่ปล่อยให้ default เป็น 0", () => {
    /**
     * ตรวจที่ตัวโค้ด เพราะพลาดข้อนี้แล้วไม่มีอะไรพัง — ออเดอร์เกิดปกติ
     * แค่ด่านมัดจำเงียบไปเฉย ๆ (`depositSatisfied()` เป็นจริงเสมอเมื่อค่าเป็น 0)
     * ซึ่งเป็นรูเดิมที่เคยอยู่ในระบบมาตลอดโดยไม่มีใครเห็น
     */
    const src = readFileSync(join(process.cwd(), "lib/orders/new-order.ts"), "utf8");
    assert.match(src, /depositCents: quote\.depositCents \?\? 0/);
  });
});
