import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BETA_FREE_PRO, COMPARISON, PRO_BULLETS, effectivePlan, planDisplay, quotaFullText } from "./plans";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/media/prepare";
import { MAX_VIDEO_BYTES } from "@/lib/media/video";

describe("แพ็กเกจที่หน้าตั้งค่าบอกผู้ใช้", () => {
  it("ช่วงเบต้า ผู้ใช้ free เห็นว่าเป็น Pro และไม่ถูกเสนอให้อัปเกรด", () => {
    assert.deepEqual(planDisplay("free", true), {
      shown: "pro",
      viaBeta: true,
      offerUpgrade: false,
    });
  });

  it("หมดเบต้าแล้ว ผู้ใช้ free เห็น Free และมีปุ่มอัปเกรด", () => {
    assert.deepEqual(planDisplay("free", false), {
      shown: "free",
      viaBeta: false,
      offerUpgrade: true,
    });
  });

  it("คนที่จ่าย Pro เองไม่ถูกเรียกว่าได้จากเบต้า และไม่ถูกเสนอให้อัปเกรดซ้ำ", () => {
    for (const beta of [true, false]) {
      assert.deepEqual(planDisplay("pro", beta), {
        shown: "pro",
        viaBeta: false,
        offerUpgrade: false,
      });
    }
  });

  it("แพ็กเกจที่โชว์ตรงกับที่ใช้ตัดสินลิมิตจริงเสมอ", () => {
    for (const beta of [true, false]) {
      for (const plan of ["free", "pro", "studio"] as const) {
        assert.equal(planDisplay(plan, beta).shown, effectivePlan(plan, beta));
      }
    }
  });
});

describe("ป้าย 'เร็ว ๆ นี้' บนหน้า /pricing", () => {
  const rows = COMPARISON.flatMap((g) => g.rows);
  const row = (key: string) => rows.find((r) => r.key === key);

  it("ฟีเจอร์ที่ไม่มีโค้ดรองรับต้องติดป้ายครบทุกแถว", () => {
    for (const key of [
      "theme",
      "badge",
      "form",
      "milestone",
      "push",
      "discord",
      "listing",
      "auction",
      "waitlist",
      "crm",
      "analytics",
    ]) {
      assert.equal(row(key)?.soon, true, `แถว ${key} ต้องติดป้าย`);
    }
  });

  it("ลิมิตที่บังคับจริงในโค้ดต้องไม่ถูกติดป้ายว่ายังไม่มี", () => {
    for (const key of [
      "shop",
      "portfolio",
      "services",
      "active",
      "deposit",
      "inapp",
      "email",
      "storage",
      "filesize",
    ]) {
      assert.equal(row(key)?.soon, undefined, `แถว ${key} ใช้ได้จริงแล้ว`);
    }
  });

  it("แถวอีเมลไม่สัญญา digest ที่ไม่เคยมี — ทั้งสองแพ็กเกจได้แบบเดียวกัน", () => {
    assert.deepEqual([row("email")?.free, row("email")?.pro], [true, true]);
  });

  it("มัดจำ + ส่วนที่เหลือใช้ได้ทุกแพ็กเกจแล้ว — ไม่ใช่ของ Pro ที่ 'เร็ว ๆ นี้'", () => {
    assert.deepEqual([row("deposit")?.free, row("deposit")?.pro], [true, true]);
    // ที่ยังไม่มีคืองวดงานหลายงวด ซึ่งยังติดป้ายอยู่
    assert.equal(row("milestone")?.soon, true);
  });

  it("ขนาดไฟล์ต่อชิ้นไม่แยกตามแพ็กเกจ และตัวเลขตรงกับเพดานที่ route อัปโหลดใช้จริง", () => {
    // เดิมโชว์ Free 50 MB / Pro 200 MB ซึ่งไม่มีโค้ดไหนบังคับ
    assert.deepEqual(row("filesize")?.free, row("filesize")?.pro);
    const mb = (bytes: number) => `${bytes / 1024 ** 2} MB`;
    for (const locale of ["th", "en"] as const) {
      const text = getDictionary(locale).compare.values.fileSizeNow;
      assert.ok(text.includes(mb(MAX_IMAGE_UPLOAD_BYTES)), `${locale}: ${text}`);
      assert.ok(text.includes(mb(MAX_VIDEO_BYTES)), `${locale}: ${text}`);
    }
  });

  it("การ์ด Pro เรียงของที่ใช้ได้จริงไว้ก่อนของที่ยังไม่มี", () => {
    const firstSoon = PRO_BULLETS.findIndex((b) => b.soon);
    assert.ok(firstSoon > 0, "ต้องมีข้อที่ใช้ได้จริงอย่างน้อยหนึ่งข้อก่อน");
    assert.ok(PRO_BULLETS.slice(firstSoon).every((b) => b.soon));
  });
});

describe("ข้อความพื้นที่เต็ม", () => {
  const d = { quotaFull: "เต็ม — อัปเกรดเป็น Pro", quotaFullBeta: "เต็ม — ลบของเก่า" };

  it("ช่วงเบต้าไม่ชวนอัปเกรด — ทุกคนได้ลิมิต Pro อยู่แล้ว", () => {
    assert.equal(quotaFullText(d, true), d.quotaFullBeta);
  });

  it("ปิดเบต้าแล้วกลับมาใช้ข้อความ Pro", () => {
    assert.equal(quotaFullText(d, false), d.quotaFull);
  });

  it("ค่าเริ่มต้นตามสวิตช์ BETA_FREE_PRO", () => {
    assert.equal(quotaFullText(d), BETA_FREE_PRO ? d.quotaFullBeta : d.quotaFull);
  });

  it("ข้อความเบต้าของทั้งสองภาษาไม่พูดถึง Pro", () => {
    for (const locale of ["th", "en"] as const) {
      const t = getDictionary(locale);
      for (const text of [t.media.quotaFullBeta, t.delivery.quotaFullBeta]) {
        assert.equal(/pro|อัปเกรด|upgrade/i.test(text), false, text);
      }
    }
  });

  // ของที่ลบยังนับโควตาจนงานเก็บกวาดรายวันลบจริง (24 ชม. + รอรอบ cron) — บอกให้ลองใหม่ทันทีคือโกหก
  it("ข้อความเบต้าไม่สัญญาว่าลบแล้วอัปใหม่ได้ทันที และบอกว่าต้องรอ", () => {
    for (const locale of ["th", "en"] as const) {
      const t = getDictionary(locale);
      for (const text of [t.media.quotaFullBeta, t.delivery.quotaFullBeta]) {
        assert.equal(/try again|แล้วอัปใหม่/i.test(text), false, text);
        assert.equal(/2 วัน|two days/.test(text), true, text);
      }
    }
  });
});
