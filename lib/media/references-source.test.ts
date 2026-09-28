import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ด่านใน SQL ต้องมี DB และไฟล์พวกนี้ import "server-only" — ตรวจที่ตัวโค้ด
 * (เหตุผลเต็มอยู่ที่ `orphanUnreferenced` / `relinkReferencedOrphansSql` ใน references.ts)
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** ทุก `db.batch([` ที่มี `needle` อยู่ข้างใน ต้องเริ่มด้วย `lockStorage(user.id)` */
function batchesWith(src: string, needle: RegExp): string[] {
  return src
    .split("await db.batch([")
    .slice(1)
    .map((b) => b.slice(0, b.indexOf("]);")))
    .filter((b) => needle.test(b));
}

describe("การปลดไฟล์สาธารณะเป็น orphan", () => {
  it("ทุก batch ที่ปลด/ผูกไฟล์สาธารณะล็อกของเจ้าของก่อน — กันการแข่งที่ปลดไฟล์ที่ยังใช้อยู่", () => {
    const files = ["lib/media/actions.ts", "app/(app)/services/actions.ts"];
    let n = 0;
    for (const f of files) {
      for (const b of batchesWith(read(f), /orphanUnreferenced\(|status: "linked"/)) {
        n++;
        assert.match(b.trimStart().split("\n").find((l) => !l.trim().startsWith("//")) ?? "", /^\s*lockStorage\(user\.id\),/, `${f}: ${b.slice(0, 80)}`);
      }
    }
    // setShopImage, addPortfolioItem, removePortfolioItem, setServiceCover, deleteService
    assert.equal(n, 5);
  });

  it("งานเก็บกวาดคืนสถานะแถว orphan ที่ยังมีคนใช้ก่อนเลือกแถวที่จะลบ และ dry run ไม่เขียน", () => {
    const ref = read("lib/media/references.ts");
    const relink = ref.slice(ref.indexOf("export function relinkReferencedOrphansSql"));
    assert.match(relink, /set status = 'linked', orphaned_at = null/);
    assert.match(relink, /m\.status = 'orphan'\s+and m\.access = 'public'\s+and \$\{mediaReferencedSql\(sql`m\.id`\)\}\$\{scope\}/);

    const clean = read("lib/media/cleanup.ts");
    const sweep = clean.slice(clean.indexOf("export async function sweepOrphanRows"));
    const relinkAt = sweep.indexOf("relinkReferencedOrphansSql(scope)");
    assert.ok(relinkAt > 0);
    assert.ok(relinkAt < sweep.indexOf("where ${dueOrphanSql(cutoff)}${scope}"));
    assert.ok(sweep.indexOf("if (dryRun) {") < relinkAt);
  });
});
