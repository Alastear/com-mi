/**
 * คำนวณราคาออเดอร์ — **ฝั่ง server เท่านั้นที่นับจริง**
 *
 * ราคาที่เบราว์เซอร์ส่งมาใช้ไม่ได้เลย ใครก็แก้ตัวเลขใน request ได้
 * ฟังก์ชันนี้รับแค่ "ลูกค้าเลือกอะไร" (tier id, option id, จำนวน)
 * แล้วไปหยิบราคาจากเมนูใน DB มาคูณเอง ผลลัพธ์ที่ได้คือราคาที่บันทึกลงออเดอร์
 *
 * ฝั่ง client ก็เรียกฟังก์ชันเดียวกันนี้เพื่อโชว์ยอดรวมสด ๆ — โค้ดชุดเดียว
 * ทำให้ตัวเลขที่ลูกค้าเห็นกับที่บันทึกจริงตรงกันเสมอ ไม่ต้องคอย sync สองสูตร
 *
 * ### สิ่งที่ห้ามพัง
 * 1. `totalCents === subtotalCents + addonsCents` — ตาราง `order` เก็บทั้งสามค่า
 *    แยกคอลัมน์ ถ้าเอกลักษณ์นี้ไม่จริง ใบเสร็จกับยอดที่เก็บจะขัดกันเอง
 * 2. ผลรวมของทุกบรรทัด (`unitPriceCents * quantity`) ต้องเท่ากับ `totalCents`
 *    เพราะมีสี่ที่เรนเดอร์บรรทัดแยกกันแล้วให้ผู้ใช้บวกเอง
 * 3. ทุกจำนวนเป็น integer สตางค์ — ไม่มี float หลุดเข้าคอลัมน์ `integer` ได้
 */

export type PricingService = {
  basePriceCents: number;
  title: string;
  tiers: readonly { id: string; label: string; priceDeltaCents: number }[];
  options: readonly {
    id: string;
    label: string;
    priceDeltaCents: number;
    /** 0 = ตัวเลือกแบบบวกเงิน · >10000 = ตัวคูณเป็น basis point (20000 = x2) */
    priceMultiplierBp?: number;
    inputType: string;
    maxQuantity: number | null;
  }[];
};

/** สิ่งที่ลูกค้าเลือก — มีแค่ id กับจำนวน ไม่มีราคา */
export type Selection = {
  tierId: string | null;
  options: readonly { optionId: string; quantity: number }[];
};

export type PriceLine = {
  label: string;
  kind: "base" | "tier" | "option" | "multiplier" | "custom";
  unitPriceCents: number;
  quantity: number;
  sourceId: string | null;
  /**
   * อัตราคูณของบรรทัดนี้ เป็น basis point — มีเฉพาะบรรทัด `multiplier`
   * ใช้แค่แสดงผล ("x2") เงินจริงอยู่ใน `unitPriceCents` ที่คิดสำเร็จแล้ว
   */
  multiplierBp?: number;
};

export type Quote = {
  lines: PriceLine[];
  subtotalCents: number;
  addonsCents: number;
  totalCents: number;
};

/**
 * เพดานจำนวนเมื่อ option ไม่ได้กำหนด maxQuantity ไว้
 * ต้องมีเพดานเสมอ ไม่งั้นส่ง quantity มหาศาลมาแล้วยอดรวมล้น integer
 */
const DEFAULT_MAX_QUANTITY = 20;

/** 10000 bp = x1.0 — ค่ากลางที่ "คูณแล้วไม่เปลี่ยนอะไร" */
export const BP_ONE = 10_000;

/** เพดานตัวคูณ x10 — กันครีเอเตอร์พิมพ์ผิดแล้วออกใบเสร็จหลักแสน */
export const MAX_MULTIPLIER_BP = 100_000;

/**
 * เกณฑ์ต้องเป็น "> x1" ไม่ใช่ "> 0"
 *
 * ค่าระหว่าง 1 ถึง 10000 ไม่มีความหมาย (คูณแล้วราคาลด) และฟอร์มก็กันไว้แล้ว
 * แต่ถ้าเจอในข้อมูล — แก้ตรง DB หรือของเก่า — ต้องตกกลับไปเป็นตัวเลือกแบบบวกเงิน
 * ไม่ใช่ถูกนับเป็นตัวคูณแล้วโดนข้าม ซึ่งจะทำให้ `priceDeltaCents` ของแถวนั้นหายเงียบ ๆ
 */
export function isMultiplierOption(o: { priceMultiplierBp?: number }): boolean {
  return (o.priceMultiplierBp ?? 0) > BP_ONE;
}

/**
 * ปัดเป็นบาทเต็ม
 *
 * ราคาทุกตัวในระบบตอนนี้ลงตัวเป็นบาท (ตรวจข้อมูลจริงแล้ว 31 แถว ไม่มีข้อยกเว้น)
 * และ `formatMoney` ใช้ `cents % 100 === 0` ตัดสินว่าจะโชว์ทศนิยมไหม
 * ถ้าปล่อยให้ตัวคูณสร้างเศษสตางค์ ราคาทั้งเว็บจะเริ่มมี ".50" ห้อยแบบไม่ตั้งใจ
 *
 * ใช้ `Math.round` ไม่ใช่ ceil/floor — เป็นฟังก์ชันเดียวกันทั้งสองฝั่ง
 * และตัวเลขที่เข้ามาเป็น integer ที่คูณกันแล้วยังห่างจาก 2^53 มาก จึงตรงกันบิตต่อบิต
 */
function roundToBaht(cents: number): number {
  return Math.round(cents / 100) * 100;
}

export function quoteOrder(service: PricingService, selection: Selection): Quote {
  const lines: PriceLine[] = [
    {
      label: service.title,
      kind: "base",
      unitPriceCents: service.basePriceCents,
      quantity: 1,
      sourceId: null,
    },
  ];

  // tier ที่ส่งมาไม่ตรงกับเมนูนี้ = ไม่คิดเงินเพิ่ม ไม่ใช่โยน error
  // (ครีเอเตอร์อาจลบ tier ทิ้งระหว่างที่ลูกค้าเปิดหน้าค้างไว้)
  const tier = selection.tierId
    ? service.tiers.find((t) => t.id === selection.tierId)
    : undefined;
  if (tier) {
    lines.push({
      label: tier.label,
      kind: "tier",
      unitPriceCents: tier.priceDeltaCents,
      quantity: 1,
      sourceId: tier.id,
    });
  }

  let addonsCents = 0;
  /**
   * ตัวคูณที่ลูกค้าเลือกไว้ เก็บไว้ก่อนแล้วค่อยคิดตอนท้าย
   * เพราะคูณจาก "ยอดรวมทั้งหมด" ซึ่งยังไม่รู้จนกว่าของเสริมจะครบ
   */
  const multipliers: {
    option: PricingService["options"][number];
    bp: number;
    /** ลำดับในเมนู ไม่ใช่ลำดับที่ลูกค้าติ๊ก — ดูเหตุผลตอนแบ่งยอด */
    menuIndex: number;
  }[] = [];

  for (const picked of selection.options) {
    const opt = service.options.find((o) => o.id === picked.optionId);
    if (!opt) continue;

    if (isMultiplierOption(opt)) {
      /**
       * ตัวคูณเป็นติ๊กถูกเสมอ จำนวนไม่มีความหมาย — "ใช้เชิงพาณิชย์ 3 ครั้ง" ไม่ใช่เรื่อง
       * ค่าที่ส่งมา 0 หรือติดลบ = ไม่ได้ติ๊ก
       *
       * ⚠️ ต้อง `|| 0` เหมือนทางของ option ธรรมดา — `Math.trunc(NaN)` คือ `NaN`
       * และ `NaN < 1` เป็น false ทุกกรณี ถ้าเทียบตรง ๆ ค่าเพี้ยนจะ "ผ่าน" ด่านนี้ไป
       * แล้วคิดค่าลิขสิทธิ์ให้ทั้งที่ลูกค้าไม่ได้ติ๊ก
       */
      if ((Math.trunc(picked.quantity) || 0) < 1) continue;
      const bp = Math.min(opt.priceMultiplierBp ?? 0, MAX_MULTIPLIER_BP);
      // เลือกซ้ำก็คิดครั้งเดียว
      if (!multipliers.some((m) => m.option.id === opt.id)) {
        multipliers.push({ option: opt, bp, menuIndex: service.options.indexOf(opt) });
      }
      continue;
    }

    const cap = opt.inputType === "quantity" ? (opt.maxQuantity ?? DEFAULT_MAX_QUANTITY) : 1;
    // ปัดเข้าในช่วงที่รับได้แทนที่จะปฏิเสธทั้งออเดอร์ — ค่าเพี้ยนมักมาจาก UI ไม่ใช่เจตนา
    const quantity = Math.min(Math.max(Math.trunc(picked.quantity) || 0, 0), cap);
    if (quantity <= 0) continue;

    addonsCents += opt.priceDeltaCents * quantity;
    lines.push({
      label: opt.label,
      kind: "option",
      unitPriceCents: opt.priceDeltaCents,
      quantity,
      sourceId: opt.id,
    });
  }

  const subtotalCents = service.basePriceCents + (tier?.priceDeltaCents ?? 0);

  /**
   * ตัวคูณคิดจากยอดรวมทั้งหมด (ค่างาน + ของเสริม) ตามที่เจ้าของร้านเลือกไว้
   * เหตุผล: งานที่ใหญ่ขึ้นเพราะเพิ่มตัวละครก็มีมูลค่าเชิงพาณิชย์มากขึ้นตาม
   *
   * เลือกหลายตัวคูณพร้อมกัน = **บวกส่วนที่เกิน x1 เข้าด้วยกัน ไม่ใช่คูณต่อกัน**
   * (x2 กับ x1.5 ได้ x2.5 ไม่ใช่ x3) เพื่อให้ผลไม่ขึ้นกับลำดับที่ติ๊ก
   * ซึ่งลูกค้าเดาไม่ได้ และเพื่อไม่ให้ยอดพุ่งเกินที่ครีเอเตอร์ตั้งใจ
   */
  const beforeMultiplier = subtotalCents + addonsCents;
  let extraBp = 0;
  for (const m of multipliers) extraBp += m.bp - BP_ONE;

  if (extraBp > 0 && beforeMultiplier > 0) {
    /**
     * แจกยอดเป็น "ผลต่างของยอดสะสมที่ปัดแล้ว"
     *
     * เคยปัดแต่ละบรรทัดแยกกันแล้วโยนเศษให้บรรทัดสุดท้าย ซึ่ง**ทำให้บรรทัดติดลบได้จริง**:
     * งาน 1 บาท ติ๊ก x1.5 + x1.5 + x1.0001 → สองบรรทัดแรกปัดขึ้นเป็น 100 สตางค์ทั้งคู่
     * แต่ยอดรวมที่ปัดแล้วก็ 100 บรรทัดสุดท้ายจึงเหลือ -100 สตางค์ ซึ่งอ่านแล้วเหมือนคิดเงินคืน
     *
     * ยอดสะสมเป็นฟังก์ชันไม่ลด และการปัดก็ไม่ลด ผลต่างจึงไม่ติดลบเด็ดขาด
     * และผลรวมหักล้างกันเหลือยอดสะสมก้อนสุดท้ายพอดี = ยอดที่ควรได้เป๊ะ ๆ
     */
    /**
     * เรียงตามลำดับในเมนูก่อนแบ่ง — **ยอดรวมไม่ขึ้นกับลำดับอยู่แล้ว แต่ยอดรายบรรทัดขึ้น**
     *
     * ฝั่งลูกค้าส่งมาตามลำดับที่ `Object.entries` คืน ส่วนฝั่งเซิร์ฟเวอร์อ่านจาก request
     * ถ้าลำดับต่างกัน เศษที่ปัดจะไปตกคนละบรรทัด ใบเสร็จที่เก็บก็จะไม่ตรงกับที่ลูกค้าเห็น
     * ทั้งที่ยอดสุดท้ายเท่ากัน — เรียงจากเมนูซึ่งเป็นลำดับเดียวกันทั้งสองฝั่งจึงตัดปัญหาทิ้ง
     */
    multipliers.sort((a, b) => a.menuIndex - b.menuIndex);

    let cumulativeBp = 0;
    let handed = 0;
    for (const m of multipliers) {
      cumulativeBp += m.bp - BP_ONE;
      const upTo = roundToBaht((beforeMultiplier * cumulativeBp) / BP_ONE);
      const share = upTo - handed;
      handed = upTo;
      addonsCents += share;
      lines.push({
        label: m.option.label,
        kind: "multiplier",
        unitPriceCents: share,
        quantity: 1,
        sourceId: m.option.id,
        multiplierBp: m.bp,
      });
    }
  }

  return {
    lines,
    subtotalCents,
    addonsCents,
    totalCents: subtotalCents + addonsCents,
  };
}

/* ── ใบเสนอราคาที่ครีเอเตอร์เขียนเอง ────────────────────────────────── */

export type QuoteLineInput = {
  label: string;
  /** จำนวนเงินของบรรทัดนี้ หน่วยสตางค์ — ครีเอเตอร์กรอกเป็นบาทแล้วแปลงที่ขอบฟอร์ม */
  amountCents: number;
};

/**
 * ประกอบใบเสนอราคาจากบรรทัดที่ครีเอเตอร์เขียน
 *
 * เป็นสูตรราคา **ตัวที่สอง** ของระบบ ต่างจาก `quoteOrder` ที่คิดจากเมนู —
 * ตัวนี้รับตัวเลขที่คนพิมพ์มาตรง ๆ จึงต้องถูกบังคับด้วยเอกลักษณ์ชุดเดียวกัน
 * ไม่งั้นจะมีสองนิยามของคำว่า "ราคาออเดอร์" ที่เพี้ยนออกจากกันได้:
 *
 *   1. `totalCents === subtotalCents + addonsCents`
 *   2. ผลรวมของทุกบรรทัดเท่ากับ `totalCents`
 *   3. ทุกยอดลงตัวเป็นบาท
 *
 * ทำให้ข้อ 1 จริงด้วยการยกทุกบรรทัดเป็น `subtotal` และให้ `addons` เป็นศูนย์ —
 * ใบเสนอราคาที่เขียนเองไม่มีแนวคิด "ของเสริม" แยกจาก "ค่างานหลัก" อยู่แล้ว
 * ทุกบรรทัดคือสิ่งที่ตกลงกันมา ไม่ได้มาจากเมนู
 */
/** ทำให้เป็นจำนวนเต็มสตางค์ที่ลงตัวเป็นบาท — ค่าที่ไม่ใช่ตัวเลขจำกัดกลายเป็น 0 */
function toBaht(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.trunc(n) / 100) * 100;
}

export function quoteFromLines(lines: readonly QuoteLineInput[]): Quote {
  const clean = lines
    .map((l) => ({
      label: l.label.trim(),
      /**
       * ปัดเป็นบาทเต็มตั้งแต่ต้นทาง เอกลักษณ์ข้อ 3 จึงจริงโดยโครงสร้าง ไม่ใช่โดยบังเอิญ
       *
       * ⚠️ ต้องเช็ค `isFinite` ไม่ใช่แค่ `|| 0` — `Math.trunc(Infinity)` คือ `Infinity`
       * และ `Infinity || 0` ก็ยังเป็น `Infinity` ยอดรวมจะกลายเป็น Infinity ทั้งใบ
       * (`NaN` ตกที่ `|| 0` ได้ แต่ `Infinity` ไม่ตก — เทสต์จับได้ตอนเขียนพอดี)
       */
      amountCents: toBaht(l.amountCents),
    }))
    // บรรทัดไม่มีชื่อคือช่องที่ผู้ใช้เผลอเว้นไว้ ไม่ใช่ของฟรี — ทิ้งไปทั้งบรรทัด
    .filter((l) => l.label.length > 0 && l.amountCents !== 0);

  const priceLines: PriceLine[] = clean.map((l) => ({
    label: l.label,
    kind: "custom",
    unitPriceCents: l.amountCents,
    quantity: 1,
    sourceId: null,
  }));

  const subtotalCents = priceLines.reduce((n, l) => n + l.unitPriceCents, 0);

  return { lines: priceLines, subtotalCents, addonsCents: 0, totalCents: subtotalCents };
}

/**
 * มัดจำเป็นจำนวนเงิน คิดจากเปอร์เซ็นต์ของยอดรวม
 *
 * อยู่ที่นี่เพราะมีคนใช้สองฝั่ง: ฟอร์มของครีเอเตอร์ที่พรีวิวให้เห็นก่อนกดส่ง
 * และ `issueQuote()` ที่เขียนลงฐานข้อมูลจริง ถ้าต่างคนต่างคิด ตัวเลขที่ครีเอเตอร์
 * เห็นตอนกดส่งกับตัวเลขที่ลูกค้าต้องจ่ายมีสิทธิ์ไม่ตรงกัน — และคนที่รู้ตัวคือลูกค้า
 *
 * เก็บผลเป็น "เงิน" ไม่ใช่ "เปอร์เซ็นต์" เพราะด่าน `depositSatisfied()`
 * เทียบกับ `amountPaidCents` ตรง ๆ ถ้าเก็บเปอร์เซ็นต์ก็ต้องคำนวณซ้ำทุกจุดที่ใช้
 *
 * ไม่มีทางเกินยอดรวม และลงตัวเป็นบาทเสมอเหมือนทุกยอดในระบบ
 */
export function depositFor(totalCents: number, percent: number): number {
  if (!Number.isFinite(totalCents) || !Number.isFinite(percent)) return 0;
  if (totalCents <= 0 || percent <= 0) return 0;
  const pct = Math.min(100, percent);
  return Math.min(totalCents, Math.round((totalCents * pct) / 100 / 100) * 100);
}
