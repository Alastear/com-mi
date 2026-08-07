/**
 * คำนวณราคาออเดอร์ — **ฝั่ง server เท่านั้นที่นับจริง**
 *
 * ราคาที่เบราว์เซอร์ส่งมาใช้ไม่ได้เลย ใครก็แก้ตัวเลขใน request ได้
 * ฟังก์ชันนี้รับแค่ "ลูกค้าเลือกอะไร" (tier id, option id, จำนวน)
 * แล้วไปหยิบราคาจากเมนูใน DB มาคูณเอง ผลลัพธ์ที่ได้คือราคาที่บันทึกลงออเดอร์
 *
 * ฝั่ง client ก็เรียกฟังก์ชันเดียวกันนี้เพื่อโชว์ยอดรวมสด ๆ — โค้ดชุดเดียว
 * ทำให้ตัวเลขที่ลูกค้าเห็นกับที่บันทึกจริงตรงกันเสมอ ไม่ต้องคอย sync สองสูตร
 */

export type PricingService = {
  basePriceCents: number;
  title: string;
  tiers: readonly { id: string; label: string; priceDeltaCents: number }[];
  options: readonly {
    id: string;
    label: string;
    priceDeltaCents: number;
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
  kind: "base" | "tier" | "option";
  unitPriceCents: number;
  quantity: number;
  sourceId: string | null;
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
  for (const picked of selection.options) {
    const opt = service.options.find((o) => o.id === picked.optionId);
    if (!opt) continue;

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

  return {
    lines,
    subtotalCents,
    addonsCents,
    totalCents: subtotalCents + addonsCents,
  };
}
