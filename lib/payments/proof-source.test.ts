import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * lib/payments/actions.ts import "server-only" — ตรวจที่ตัวโค้ดแทน (เหตุผลอยู่ที่ `proofMediaId` ใน RecordSchema)
 */
describe("สลิปแนบแถวเงิน", () => {
  const src = readFileSync(join(process.cwd(), "lib/payments/actions.ts"), "utf8");

  it("รับได้แค่ null — id ไฟล์ของคนอื่นต้องตรึงไฟล์ไว้ในถังไม่ได้", () => {
    assert.match(src, /proofMediaId: z\.null\(\),/);
    assert.doesNotMatch(src, /\$\{v\.proofMediaId\}/);
  });

  it("insert เขียน null ตรง ๆ ไม่ใช่ค่าจาก client", () => {
    const start = src.indexOf("insert into payment_record");
    const insert = src.slice(start, src.indexOf("on conflict (id) do nothing", start));
    assert.match(insert, /\$\{at\}::timestamptz, null::text, \$\{v\.note\}::text,/);
  });
});
