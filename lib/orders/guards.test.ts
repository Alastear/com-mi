import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canPay, PAYABLE_STATUSES } from "./release";
import { ORDER_STATUSES } from "@/lib/types";

/**
 * ด่านที่อยู่ใน SQL ของ Server Action — รันจริงไม่ได้ในเทสต์ (ต้องมี DB) จึงตรวจที่ตัวโค้ด
 *
 * ทุกข้อในไฟล์นี้เคยหายไปแล้วไม่มีอะไรพังให้เห็นทันที: action ยังตอบ ok ปกติ
 * แค่เขียนของลงไปผิดที่ (เงินบนออเดอร์ที่ยกเลิก, ราคาของใบที่ถูกแทนที่, รอบแก้ที่ลูกค้าไม่เคยเห็น)
 * ถ้าเทสต์นี้พังเพราะย้ายโค้ด ให้ตามไปดูว่าด่านยังอยู่ ไม่ใช่แค่แก้ regex ให้ผ่าน
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("เงินบนออเดอร์ที่ปิดแล้ว (lib/payments/actions.ts)", () => {
  const src = read("lib/payments/actions.ts");

  it("แจ้งโอน ยืนยัน ปฏิเสธ ยกเลิกการยืนยัน — ทั้งสี่ทางมีเงื่อนไขสถานะออเดอร์ใน SQL", () => {
    // ใน INSERT ของ recordPayment 1 ที่ + ใน WHERE ของสาม action ของครีเอเตอร์
    const uses = src.match(/orderPayableSql\(order\.id\)/g) ?? [];
    assert.ok(uses.length >= 4, `พบ ${uses.length} ที่`);
  });

  it("รายการสถานะใน SQL มาจาก PAYABLE_STATUSES ตัวเดียวกับ canPay — ไม่เขียนซ้ำ", () => {
    assert.match(src, /PAYABLE_STATUSES\.map/);
    for (const s of ORDER_STATUSES) {
      assert.equal(PAYABLE_STATUSES.includes(s), canPay(s), s);
    }
  });

  it("ออเดอร์ที่ยกเลิก/ปฏิเสธ/หมดอายุไม่อยู่ในรายการ แต่ completed อยู่ (ยกเลิกการยืนยันสลิปปลอมได้)", () => {
    for (const s of ["cancelled", "declined", "expired"] as const) {
      assert.equal(PAYABLE_STATUSES.includes(s), false, s);
    }
    assert.equal(PAYABLE_STATUSES.includes("completed"), true);
  });
});

describe("แท็บที่เปิดค้าง (lib/orders/actions.ts)", () => {
  const src = read("lib/orders/actions.ts");

  it("transitionOrder บังคับรับสถานะที่หน้าจอเห็น และตอบ stale ถ้าไม่ตรงของจริง", () => {
    assert.match(src, /from: z\.enum\(ORDER_STATUSES\)/);
    assert.match(src, /if \(order\.status !== from\) return \{ ok: false, error: "stale" \}/);
  });

  it("ทั้งแถบปุ่มและบอร์ดส่งสถานะและรุ่นที่วาดอยู่ไปด้วย", () => {
    assert.match(read("components/app/order-actions.tsx"), /from: status, version/);
    assert.match(
      read("components/app/order-board.tsx"),
      /transitionOrder\(\{ code, from, version, to \}\)/,
    );
  });

  it("รุ่น (updatedAt) บังคับส่ง และอยู่ใน WHERE ตัดที่มิลลิวินาที — จับออเดอร์ที่วนกลับมาสถานะเดิม", () => {
    assert.match(src, /version: z\.number\(\)\.int\(\)\.min\(0\),/);
    assert.doesNotMatch(src, /version: z\.number\(\)[^,]*\.optional\(\)/);
    assert.match(src, /date_trunc\('milliseconds', \$\{schema\.order\.updatedAt\}\) = \$\{versionIso\(version\)\}::timestamptz/);
  });

  it("UPDATE สถานะอยู่ใน batch หลัง lockOrder — subquery นับแถวเงินต้องเห็นแถวที่เพิ่ง commit", () => {
    const at = src.indexOf("await db.batch([\n    lockOrder(order.id),\n    db\n      .update(schema.order)");
    assert.ok(at > 0, "ต้องล็อกออเดอร์ก่อน UPDATE ใน batch เดียวกัน");
  });
});

describe("ยอมรับใบเสนอราคาที่แพ้การแข่ง (lib/orders/quote.ts)", () => {
  const src = read("lib/orders/quote.ts");
  const accept = src.slice(src.indexOf("export async function acceptQuote"), src.indexOf("/* ── ถอนใบ"));

  it("ราคา บรรทัด และ event เขียนเฉพาะเมื่อ request นี้ยอมรับใบได้จริง", () => {
    // UPDATE ออเดอร์ + DELETE บรรทัดเก่า + INSERT บรรทัดใหม่ + INSERT event
    const gated = accept.match(/exists \(\$\{acceptedHere\}\)/g) ?? [];
    assert.ok(gated.length >= 4, `พบ ${gated.length} ที่`);
  });

  it("ล็อกออเดอร์แบบ NO KEY UPDATE ไม่ใช่ FOR UPDATE — FOR UPDATE deadlock กับ issueQuote ที่เพิ่มใบใหม่", () => {
    assert.match(accept, /lockOrderForQuote\(order\.id\)/);
    assert.doesNotMatch(src, /\.for\("update"\)/);
    assert.match(src, /\.for\("no key update"\)/);
  });

  it("ออกใบใหม่ล็อกออเดอร์ก่อนแตะแถวใบ ทั้งสองเส้น", () => {
    const issue = src.slice(src.indexOf("export async function issueQuote"), src.indexOf("/* ── ยอมรับใบ"));
    assert.match(issue, /db\.batch\(\[lock, supersede, insert, promote, event, check\]\)\)\[5\]/);
    assert.match(issue, /db\.batch\(\[lock, supersede, insert, event, check\]\)\)\[4\]/);
  });

  it("ออกใบที่แพ้การแข่ง (ถอนใบ/ยกเลิกระหว่างทาง) ไม่เขียนอะไรเลย และไม่แจ้งเตือน", () => {
    const issue = src.slice(src.indexOf("export async function issueQuote"), src.indexOf("/* ── ยอมรับใบ"));
    // ด่านคือสถานะที่อ่านมา ไม่ใช่แค่ "ยัง quoted" — สองแท็บออกจาก reviewing พร้อมกันต้องแพ้หนึ่ง
    assert.match(issue, /o\.status = \$\{from\}\)`/);
    // ปิดใบเก่า + เพิ่มใบใหม่ ผูกกับสถานะ, เปลี่ยนสถานะ + event ผูกกับใบที่ batch นี้เพิ่ม
    assert.match(issue, /isNull\(schema\.orderQuote\.acceptedAt\),\n\s+stillFrom,/);
    assert.match(issue, /insert into order_quote[\s\S]*where \$\{stillFrom\}/);
    assert.match(issue, /eq\(schema\.order\.status, from\), issuedHere\)/);
    assert.match(issue, /'quote_issued'::text[\s\S]*where \$\{issuedHere\}/);
    assert.doesNotMatch(issue, /db\.insert\(schema\.(orderQuote|message)\)\.values/);
    const bail = issue.indexOf('if (issued.length === 0) return { ok: false, error: "wrong_status" }');
    const notifyAt = issue.indexOf("await notify(");
    assert.ok(bail > 0, "ต้องเช็คผลของ batch");
    assert.ok(notifyAt > bail, "notify ต้องอยู่หลังด่าน");
  });

  it("ถอนใบที่แพ้การแข่ง ไม่เขียน event ถอนใบลงเธรด และไม่ตอบ ok", () => {
    const withdraw = src.slice(src.indexOf("export async function withdrawQuote"));
    assert.match(withdraw, /'quote_withdrawn'::text[\s\S]*where exists \(\$\{withdrawnHere\}\)/);
    assert.match(withdraw, /if \(updatedOrder\.length === 0\) return \{ ok: false, error: "wrong_status" \}/);
  });

  it("ถอนใบล็อกออเดอร์ก่อนแตะแถวใบ — ลำดับเดียวกับ acceptQuote ไม่งั้น deadlock", () => {
    const withdraw = src.slice(src.indexOf("export async function withdrawQuote"));
    const lock = withdraw.indexOf("lockOrderForQuote(order.id)");
    const supersede = withdraw.indexOf(".update(schema.orderQuote)");
    assert.ok(lock > 0 && lock < supersede, "lock ต้องมาก่อน update order_quote");
  });

  it("ไม่มีแถวไหนถูกเขียน = ไม่แจ้งเตือน (ซึ่งส่งอีเมลด้วย)", () => {
    const bail = accept.indexOf("acceptedQuote.length === 0 || updatedOrder.length === 0");
    const notifyAt = accept.indexOf("await notify(");
    assert.ok(bail > 0, "ต้องเช็คผลของ batch");
    assert.ok(notifyAt > bail, "notify ต้องอยู่หลังด่าน");
  });
});

describe("ราคาที่ลูกค้าไม่เคยเห็น (lib/orders/create.ts)", () => {
  it("createOrder เทียบยอดรวมและมัดจำที่ฟอร์มโชว์ ไม่ตรง = changed ไม่สร้างออเดอร์", () => {
    const src = read("lib/orders/create.ts");
    assert.match(src, /quote\.totalCents !== v\.expectedTotalCents/);
    assert.match(src, /depositCents !== v\.expectedDepositCents/);
    const flow = read("components/service-order-flow.tsx");
    assert.match(flow, /expectedTotalCents: total/);
    assert.match(flow, /res\.error === "changed"/);
  });
});
