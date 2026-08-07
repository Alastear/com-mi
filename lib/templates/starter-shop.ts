import type { Locale } from "@/lib/i18n/config";

/**
 * เนื้อหาตั้งต้นตอนเปิดร้านครั้งแรก
 *
 * เป้าหมายจาก docs/00 §6 Loop 1: ครีเอเตอร์ต้องเปิดร้านเสร็จใน < 10 นาที
 * จึงต้องมีของให้แก้ ไม่ใช่หน้าเปล่าให้กรอกจากศูนย์
 *
 * นี่คือ "เนื้อหาที่ครีเอเตอร์เป็นเจ้าของ" ไม่ใช่ข้อความ UI — เก็บลง DB แล้วเขาแก้ได้
 * จึงไม่ได้อยู่ใน dictionary แต่ยังต้องมีสองภาษาเพื่อให้จุดเริ่มต้นเข้ากับผู้ใช้
 */

type TierSeed = { label: string; priceDeltaCents: number };
type OptionSeed = {
  groupLabel: string;
  label: string;
  priceDeltaCents: number;
  inputType: "checkbox" | "quantity";
  maxQuantity?: number;
};
type ServiceSeed = {
  slug: string;
  title: string;
  description: string;
  kind: string;
  mode: "instant" | "proposal";
  basePriceCents: number;
  deliveryDays: number;
  revisionsIncluded: number;
  includes: string[];
  tiers: TierSeed[];
  options: OptionSeed[];
};

const TH: { tos: string[]; services: ServiceSeed[] } = {
  tos: [
    "ชำระมัดจำ 50% ก่อนเริ่มงาน ส่วนที่เหลือชำระก่อนส่งไฟล์ความละเอียดเต็ม",
    "แก้ไขได้ตามจำนวนที่ระบุในแต่ละแพ็กเกจ เกินจากนั้นคิดเพิ่มตามตกลง",
    "งานที่ส่งมอบใช้สำหรับส่วนตัวเท่านั้น หากต้องการใช้เชิงพาณิชย์กรุณาแจ้งก่อน",
    "สงวนสิทธิ์ในการนำผลงานไปลงเป็นตัวอย่างในพอร์ต หากไม่สะดวกแจ้งได้ก่อนเริ่มงาน",
  ],
  services: [
    {
      slug: "half-body",
      title: "ภาพครึ่งตัว",
      description: "ภาพครึ่งตัวลงสีเต็ม เหมาะกับรูปโปรไฟล์หรือภาพหน้าปกช่อง",
      kind: "illustration",
      mode: "instant",
      basePriceCents: 80_000,
      deliveryDays: 7,
      revisionsIncluded: 2,
      includes: ["ไฟล์ PNG ความละเอียดสูง", "ไฟล์แยกพื้นหลังโปร่งใส", "ส่ง WIP ให้ตรวจก่อนลงสี"],
      tiers: [
        { label: "Sketch", priceDeltaCents: -40_000 },
        { label: "Flat color", priceDeltaCents: -20_000 },
        { label: "Full render", priceDeltaCents: 0 },
      ],
      options: [
        { groupLabel: "พื้นหลัง", label: "พื้นหลังแบบมีรายละเอียด", priceDeltaCents: 30_000, inputType: "checkbox" },
        { groupLabel: "ตัวละคร", label: "เพิ่มตัวละคร", priceDeltaCents: 50_000, inputType: "quantity", maxQuantity: 3 },
      ],
    },
    {
      slug: "full-body",
      title: "ภาพเต็มตัว",
      description: "ภาพเต็มตัวลงสีเต็ม เห็นรายละเอียดชุดและท่าทางครบ",
      kind: "illustration",
      mode: "instant",
      basePriceCents: 150_000,
      deliveryDays: 14,
      revisionsIncluded: 3,
      includes: ["ไฟล์ PNG ความละเอียดสูง", "ไฟล์แยกพื้นหลังโปร่งใส", "ส่ง WIP ให้ตรวจ 3 รอบ"],
      tiers: [
        { label: "Sketch", priceDeltaCents: -80_000 },
        { label: "Flat color", priceDeltaCents: -40_000 },
        { label: "Full render", priceDeltaCents: 0 },
      ],
      options: [
        { groupLabel: "พื้นหลัง", label: "พื้นหลังแบบมีรายละเอียด", priceDeltaCents: 50_000, inputType: "checkbox" },
        { groupLabel: "ตัวละคร", label: "เพิ่มตัวละคร", priceDeltaCents: 90_000, inputType: "quantity", maxQuantity: 3 },
      ],
    },
    {
      slug: "chibi",
      title: "ภาพชิบิ",
      description: "ภาพชิบิน่ารัก ๆ เหมาะกับสติกเกอร์หรือรูปโปรไฟล์",
      kind: "chibi",
      mode: "instant",
      basePriceCents: 45_000,
      deliveryDays: 5,
      revisionsIncluded: 2,
      includes: ["ไฟล์ PNG", "พื้นหลังโปร่งใส"],
      tiers: [
        { label: "Flat color", priceDeltaCents: 0 },
        { label: "Shaded", priceDeltaCents: 20_000 },
      ],
      options: [
        { groupLabel: "ตัวละคร", label: "เพิ่มตัวละคร", priceDeltaCents: 30_000, inputType: "quantity", maxQuantity: 4 },
      ],
    },
  ],
};

const EN: { tos: string[]; services: ServiceSeed[] } = {
  tos: [
    "50% deposit before I start; the rest before I send the full-resolution files.",
    "Revisions are limited to the number listed on each package; extra rounds are charged separately.",
    "Delivered work is for personal use. Let me know beforehand if you need commercial rights.",
    "I may post the finished piece in my portfolio — tell me before we start if you'd rather I didn't.",
  ],
  services: [
    {
      slug: "half-body",
      title: "Half body illustration",
      description: "A fully coloured half-body piece — good for profile pictures and channel art.",
      kind: "illustration",
      mode: "instant",
      basePriceCents: 80_000,
      deliveryDays: 7,
      revisionsIncluded: 2,
      includes: ["High-resolution PNG", "Transparent background version", "WIP sent before colouring"],
      tiers: [
        { label: "Sketch", priceDeltaCents: -40_000 },
        { label: "Flat color", priceDeltaCents: -20_000 },
        { label: "Full render", priceDeltaCents: 0 },
      ],
      options: [
        { groupLabel: "Background", label: "Detailed background", priceDeltaCents: 30_000, inputType: "checkbox" },
        { groupLabel: "Characters", label: "Extra character", priceDeltaCents: 50_000, inputType: "quantity", maxQuantity: 3 },
      ],
    },
    {
      slug: "full-body",
      title: "Full body illustration",
      description: "A fully coloured full-body piece showing the whole outfit and pose.",
      kind: "illustration",
      mode: "instant",
      basePriceCents: 150_000,
      deliveryDays: 14,
      revisionsIncluded: 3,
      includes: ["High-resolution PNG", "Transparent background version", "Three WIP checkpoints"],
      tiers: [
        { label: "Sketch", priceDeltaCents: -80_000 },
        { label: "Flat color", priceDeltaCents: -40_000 },
        { label: "Full render", priceDeltaCents: 0 },
      ],
      options: [
        { groupLabel: "Background", label: "Detailed background", priceDeltaCents: 50_000, inputType: "checkbox" },
        { groupLabel: "Characters", label: "Extra character", priceDeltaCents: 90_000, inputType: "quantity", maxQuantity: 3 },
      ],
    },
    {
      slug: "chibi",
      title: "Chibi illustration",
      description: "A cute chibi piece — works well as a sticker or an avatar.",
      kind: "chibi",
      mode: "instant",
      basePriceCents: 45_000,
      deliveryDays: 5,
      revisionsIncluded: 2,
      includes: ["PNG file", "Transparent background"],
      tiers: [
        { label: "Flat color", priceDeltaCents: 0 },
        { label: "Shaded", priceDeltaCents: 20_000 },
      ],
      options: [
        { groupLabel: "Characters", label: "Extra character", priceDeltaCents: 30_000, inputType: "quantity", maxQuantity: 4 },
      ],
    },
  ],
};

export function starterShop(locale: Locale) {
  return locale === "en" ? EN : TH;
}

/**
 * ร่างข้อตกลงตั้งต้น — **ข้อเสนอ ไม่ใช่ค่าเริ่มต้น**
 *
 * เคยยัดสี่ข้อนี้ให้ทุกร้านตอนสร้าง ผลคือครีเอเตอร์ที่ไม่เคยเปิดหน้า /shop
 * ก็มีข้อตกลงที่ไม่ได้เขียนเองผูกอยู่ — และไม่ใช่ข้อความลอย ๆ ด้วย
 * "มัดจำ 50%" กับ "ห้ามใช้เชิงพาณิชย์" คือเงื่อนไขที่ลูกค้าใช้อ้างได้จริง
 * ตอนนี้จึงให้กดใส่เองจากหน้าแก้ไข จะได้อ่านก่อนที่มันจะกลายเป็นข้อตกลงของตัวเอง
 */
export function starterTos(locale: Locale): string[] {
  return starterShop(locale).tos;
}

export const STARTER_TAGLINE: Record<Locale, string> = {
  th: "รับงาน commission — แก้ข้อความนี้ได้ในหน้าตั้งค่า",
  en: "Taking commissions — edit this line in settings",
};
