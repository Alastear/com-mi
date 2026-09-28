/**
 * แหล่งความจริงเดียวของแพ็กเกจและลิมิต
 * ตรงกับ docs/03-plans-and-entitlements.md §4.1
 *
 * ตอนต่อของจริง: `can()` / `limitOf()` ต้องเป็น synchronous ล้วน
 * เพราะ plan อยู่ใน session cookie cache แล้ว (ไม่มี I/O)
 */

/**
 * ฟีเจอร์ที่แพ็กเกจปลดล็อก
 *
 * ตัดออกหลัง research คู่แข่ง (docs/00 §3) — scope ที่ตัดได้คือกำไรที่ถูกที่สุด:
 *   custom_domain      ขัดกับกลยุทธ์กระจายของเราเอง (ลิงก์ com-mi/@handle คือสิ่งที่คนจำ)
 *                      + ภาระ DNS/ใบรับรอง ให้แพ็กเกจที่ยังไม่มีผู้ใช้ และ VGen เองก็ไม่มี
 *   api_access         ไม่มีหลักฐานความต้องการเลย และเป็นสัญญาถาวรสำหรับทีมคนเดียว
 *   conditional_fields ไม่มีครีเอเตอร์ไทยคนไหนขอ logic แบบแตกกิ่ง — ที่ขอคือ TOS ภาษาไทย
 *   calendar           เป็นแค่มุมมองของ order.dueAt และ free จำกัด 5 งานอยู่แล้ว
 *                      แทนด้วยแถบ "ครบกำหนดสัปดาห์นี้" บนบอร์ด ซึ่งคนเห็นจริง
 *
 * `line_notify` → `line_messaging` — LINE Notify ถูกปิดไปแล้ว ทางที่ใช้ได้คือ Messaging API
 * ซึ่งต้องมี Official Account และมีโควตาข้อความ (เป็นการแก้ชื่อกับลำดับ ไม่ใช่ตัดทิ้ง)
 */
export const FEATURES = [
  "push_notifications",
  "discord_webhook",
  "line_messaging",
  "instant_email",
  "milestones",
  "custom_form",
  "auctions",
  "custom_theme",
  "hide_badge",
  "analytics",
  "crm",
  "export",
  "invoice_pdf",
  "waitlist_broadcast",
  "notification_prefs",
  "team_seats",
] as const;
export type Feature = (typeof FEATURES)[number];

export type Limits = {
  active_orders: number;
  services: number;
  portfolio_items: number;
  storage_bytes: number;
  file_size_bytes: number;
  active_listings: number;
  delivery_retention_days: number;
};
export type LimitKey = keyof Limits;

const UNLIMITED = Number.POSITIVE_INFINITY;
const MB = 1024 ** 2;
const GB = 1024 ** 3;

export type PlanId = "free" | "pro" | "studio";

export type PlanDefinition = {
  id: PlanId;
  priceCentsMonthly: number;
  priceCentsYearly: number;
  features: ReadonlySet<Feature>;
  limits: Limits;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    priceCentsMonthly: 0,
    priceCentsYearly: 0,
    features: new Set<Feature>(),
    limits: {
      /**
       * ตัดสินใจไว้ที่ 5 (เดิมเสนอ 3) — free tier ต้องใช้จริงได้ไม่อึดอัด
       *
       * `orders_per_month` ถูกตัดทิ้ง: ไม่มีใครที่ติดเพดาน 5 งานพร้อมกัน
       * จะไปถึง 20 งาน/เดือนได้ ลิมิตที่ไม่เคยทำงานมีแต่ทำให้ free tier ดูใจแคบ
       */
      active_orders: 5,
      services: 5,
      /**
       * ขยับขึ้นตอนรองรับวิดีโอ (เดิม 12 ชิ้น / 300 MB / 20 MB ต่อไฟล์)
       *
       * คิดจากต้นทุนจริงของ Vercel Blob แล้วพบว่า **egress คือค่าใช้จ่ายจริง
       * ไม่ใช่พื้นที่เก็บ** — ครีเอเตอร์ที่ใช้เต็ม 2 GB เสียค่าเก็บ ~฿1.6/เดือน
       * ส่วนที่เหลือมาจากคนเข้ามาดู และร้านที่คนดูเยอะคือร้านที่พร้อมอัปเกรดอยู่แล้ว
       * ต้นทุนจึงปรับตัวเอง — ให้พื้นที่เยอะได้โดยแทบไม่มีความเสี่ยง
       * (Pro หนึ่งคนคุ้มค่าเก็บของครีเอเตอร์ฟรีที่ใช้เต็มโควตาได้ราว 100 คน)
       *
       * สิ่งที่ยังต้องคุมคือ **ขนาดต่อไฟล์** เพราะมันคุม egress ต่อการเปิดหนึ่งครั้ง
       * 50 MB พอสำหรับคลิปตัวอย่าง 60 วินาที (≤40 MB) และไฟล์ส่งมอบทั่วไป
       * ส่วนไฟล์ต้นฉบับก้อนใหญ่คือเหตุผลที่ Pro มีอยู่
       *
       * `delivery_retention_days: 90` คือตัวคุมการโตแบบไม่มีขอบเขตจริง ๆ
       * ไฟล์ส่งมอบสะสมตามจำนวนออเดอร์ ไม่ใช่ตามพื้นที่ที่ตั้งไว้
       */
      portfolio_items: 30,
      storage_bytes: 2 * GB,
      file_size_bytes: 50 * MB,
      active_listings: 3,
      delivery_retention_days: 90,
    },
  },
  pro: {
    id: "pro",
    priceCentsMonthly: 15_900,
    priceCentsYearly: 159_000,
    features: new Set<Feature>([
      "push_notifications",
      "discord_webhook",
      "line_messaging",
      "instant_email",
      "milestones",
      "custom_form",
      "auctions",
      "custom_theme",
      "hide_badge",
      "analytics",
      "crm",
      "export",
      "invoice_pdf",
      "waitlist_broadcast",
      "notification_prefs",
    ]),
    limits: {
      active_orders: UNLIMITED,
      services: UNLIMITED,
      portfolio_items: 300,
      storage_bytes: 20 * GB,
      file_size_bytes: 200 * MB,
      active_listings: UNLIMITED,
      delivery_retention_days: UNLIMITED,
    },
  },
  studio: {
    id: "studio",
    priceCentsMonthly: 49_900,
    priceCentsYearly: 499_000,
    features: new Set<Feature>(FEATURES),
    limits: {
      active_orders: UNLIMITED,
      services: UNLIMITED,
      portfolio_items: UNLIMITED,
      storage_bytes: 100 * GB,
      file_size_bytes: 500 * MB,
      active_listings: UNLIMITED,
      delivery_retention_days: UNLIMITED,
    },
  },
};

/**
 * ช่วงเบต้า — ทุกคนได้ของเท่า Pro โดยไม่ต้องจ่าย
 *
 * เจ้าของตัดสินใจเปิดให้ใช้เต็มทุกฟีเจอร์จนกว่าจะเริ่มเก็บเงินจริง
 * ทำที่นี่จุดเดียวแทนการไปแก้ทุกที่ที่อ่านลิมิต เพราะจุดที่อ่านลิมิตมีเจ็ดแห่ง
 * และการลืมแก้แห่งเดียวแปลว่ามีคนโดนบล็อกทั้งที่หน้าเว็บบอกว่าใช้ได้
 *
 * ⚠️ **หน้า /pricing ประกาศเรื่องนี้ไว้แล้ว** ถ้าปิดสวิตช์นี้โดยไม่แก้หน้านั้น
 * เว็บจะสัญญาสิ่งที่โค้ดไม่ทำให้ ซึ่งแย่กว่าไม่เคยสัญญาเลย
 *
 * ปิดตอนเริ่มเก็บเงิน: ลบ `BETA_FREE_PRO` ออก แล้วแก้ข้อความในหน้า /pricing พร้อมกัน
 */
export const BETA_FREE_PRO = true;

/**
 * แพ็กเกจที่ใช้ตัดสินสิทธิ์จริง — ช่วงเบต้าทุกคนถูกยกเป็น pro
 *
 * `beta` เปิดให้ส่งเข้ามาได้เพื่อให้เทสต์ครอบทั้งสองฝั่งของสวิตช์ได้
 * โค้ดจริงไม่ต้องส่ง ปล่อยให้อ่านจาก `BETA_FREE_PRO`
 */
export function effectivePlan(plan: PlanId, beta: boolean = BETA_FREE_PRO): PlanId {
  return beta && plan === "free" ? "pro" : plan;
}

/**
 * แพ็กเกจที่หน้า "ตั้งค่า" ควรบอกผู้ใช้ และควรเสนอปุ่มอัปเกรดไหม
 *
 * เดิมหน้าตั้งค่าอ่าน `user.plan` ตรง ๆ จึงขึ้นว่า "Free" พร้อมปุ่ม "อัปเกรดเป็น Pro"
 * ทั้งที่ช่วงเบต้าทุกคนได้ Pro อยู่แล้ว — กดไปก็เจอหน้าราคาที่บอกว่าไม่มีอะไรให้จ่าย
 * ปุ่มที่ขายของที่ผู้ใช้ได้ไปแล้วคือการบอกว่าเขาขาดอะไรบางอย่างที่เขาไม่ได้ขาด
 *
 * ⚠️ ต้องตัดสินจากแพ็กเกจที่ใช้จริง (effectivePlan) ไม่ใช่ค่าที่เก็บใน DB
 * ไม่งั้นหน้าจอกับลิมิตที่บังคับจริงจะพูดไม่ตรงกัน
 */
export function planDisplay(
  stored: PlanId,
  beta: boolean = BETA_FREE_PRO,
): { shown: PlanId; viaBeta: boolean; offerUpgrade: boolean } {
  const shown = effectivePlan(stored, beta);
  return { shown, viaBeta: shown !== stored, offerUpgrade: shown === "free" };
}

export function can(plan: PlanId, feature: Feature): boolean {
  return PLANS[plan].features.has(feature);
}

export function limitOf(plan: PlanId, key: LimitKey): number {
  return PLANS[plan].limits[key];
}

export function isUnlimited(value: number): boolean {
  return !Number.isFinite(value);
}

/**
 * ลิมิตสำหรับแสดงผล
 *
 * ⚠️ ลิมิตของ Pro เป็น `Infinity` — เอาไปใส่ JSX ตรง ๆ จะได้คำว่า "Infinity"
 * บนหน้าจอผู้ใช้ (เจอจริงตอนเปิดเบต้าให้ทุกคนได้สิทธิ์ Pro หน้าเมนูขึ้น "1 / Infinity")
 * ทุกที่ที่โชว์ลิมิตต้องผ่านฟังก์ชันนี้ ไม่ใช่จำเอาเอง
 */
export function formatLimit(value: number, unlimitedLabel: string): string {
  return isUnlimited(value) ? unlimitedLabel : String(value);
}

/**
 * ตารางเปรียบเทียบสำหรับหน้า /pricing
 *
 * ไฟล์นี้เก็บเฉพาะ "โครงสร้างและตัวเลข" — ข้อความทั้งหมดอยู่ใน lib/i18n/dictionaries.ts
 * ใต้ `compare.groups` / `compare.rows` / `compare.values` เพื่อไม่ให้มีคลังข้อความสองที่
 */
import type { Dictionary } from "@/lib/i18n/dictionaries";

type GroupKey = keyof Dictionary["compare"]["groups"];
type RowKey = keyof Dictionary["compare"]["rows"];
type ValueKey = keyof Dictionary["compare"]["values"];

/**
 * ค่าของแต่ละช่อง:
 *   true / false        → เครื่องหมายถูก / ขีด
 *   { t: "unlimited" }  → ข้อความที่ต้องแปล ดึงจาก compare.values
 *   "2 GB"              → ข้อความที่ไม่ต้องแปล (ตัวเลข หน่วย)
 */
export type CompareValue = boolean | string | { t: ValueKey };

export type ComparisonRow = {
  key: RowKey;
  free: CompareValue;
  pro: CompareValue;
  /**
   * `true` = **ยังไม่มีโค้ดรองรับ** — หน้า /pricing ติดป้าย "เร็ว ๆ นี้" ให้แถวนี้
   *
   * ⚠️ ห้ามลบ `soon` ออกจนกว่าของจะใช้ได้จริงบนเว็บ ไม่ใช่แค่ "เริ่มทำแล้ว"
   * แถวที่ไม่มีป้ายคือคำสัญญาว่าจ่ายแล้วได้ใช้ทันที
   */
  soon?: true;
};

export type ComparisonGroup = {
  key: GroupKey;
  rows: ComparisonRow[];
};

const UNLIMITED_CELL = { t: "unlimited" } as const;

/**
 * ⚠️ ตรวจกับโค้ดจริงทีละแถวแล้ว (ก.ย. 2569) — แถวที่ติด `soon` ไม่มีของอยู่เบื้องหลังเลย:
 *   theme      คอลัมน์ `creator_page.theme` มีแต่ไม่มีใครเขียนหรืออ่าน ปุ่มสีในตั้งค่ากดแล้วไม่มีผล
 *   badge      บรรทัด "สร้างด้วย com-mi" แสดงทุกร้านเสมอ ไม่มีสวิตช์
 *   form       ฟอร์มบรีฟเป็นชุดเดียวที่เขียนตายไว้ใน service-order-flow.tsx ไม่มีทั้ง 3 ชุดและแบบสร้างเอง
 *   milestone  งวดงานหลายงวด — ที่มีจริงคือมัดจำก้อนเดียว + ส่วนที่เหลือก่อนรับไฟล์ ซึ่งแยกเป็นแถว
 *              `deposit` ที่ใช้ได้ทั้งสองแพ็กเกจ (เดิมแถวนี้ชื่อ "งวดงาน / มัดจำแบ่งจ่าย" ติด Pro + เร็ว ๆ นี้
 *              ทั้งแถว ทำเหมือนมัดจำยังไม่มีและจะเป็นของ Pro ทั้งที่ทุกคนใช้อยู่แล้ว)
 *   push / discord / listing / auction / waitlist / crm / analytics
 *              ไม่มีโค้ดเลย หน้า /listings /clients /analytics เป็นภาพตัวอย่างใต้ป้าย "กำลังพัฒนา"
 *
 * แถว `filesize` เดิมบอก Free 50 MB / Pro 200 MB ต่อไฟล์ — ไม่มีโค้ดไหนแยกตามแพ็กเกจจริง
 * route อัปโหลดตัด `file_size_bytes` ด้วยเพดานคงที่ (รูปหลังย่อ `MAX_IMAGE_UPLOAD_BYTES`,
 * คลิป `MAX_VIDEO_BYTES`) ทุกแพ็กเกจจึงได้เท่ากัน และไฟล์ส่งมอบไม่มีเพดานต่อไฟล์เลย
 * (นับรวมในพื้นที่เก็บเท่านั้น) แถวนี้จึงโชว์ตัวเลขที่บังคับจริงของรูปและคลิปหน้าร้าน
 *
 * แถวอีเมลเดิมบอกว่า Free ได้ "สรุปวันละครั้ง" Pro ได้ "ทันที" — ระบบ digest ไม่เคยถูกสร้าง
 * ของจริงคือทุกแพ็กเกจได้อีเมลทันทีเฉพาะงานใหม่กับเรื่องเงิน (lib/email/notify.ts)
 * ถ้าวันหนึ่งทำ digest ให้แพ็กเกจฟรีจริง ค่อยแยกค่าสองฝั่งกลับมา
 */
export const COMPARISON: ComparisonGroup[] = [
  {
    key: "shop",
    rows: [
      { key: "shop", free: true, pro: true },
      { key: "portfolio", free: "30", pro: "300" },
      { key: "theme", free: { t: "presets3" }, pro: true, soon: true },
      { key: "badge", free: false, pro: true, soon: true },
    ],
  },
  {
    key: "menu",
    rows: [
      { key: "services", free: "5", pro: UNLIMITED_CELL },
      { key: "active", free: "5", pro: UNLIMITED_CELL },
      { key: "form", free: { t: "presets3" }, pro: { t: "fullyCustom" }, soon: true },
      { key: "deposit", free: true, pro: true },
      { key: "milestone", free: false, pro: true, soon: true },
    ],
  },
  {
    key: "notify",
    rows: [
      { key: "inapp", free: true, pro: true },
      { key: "email", free: true, pro: true },
      { key: "push", free: false, pro: true, soon: true },
      { key: "discord", free: false, pro: true, soon: true },
    ],
  },
  {
    key: "adopts",
    rows: [
      { key: "listing", free: "3", pro: UNLIMITED_CELL, soon: true },
      { key: "auction", free: false, pro: true, soon: true },
      { key: "waitlist", free: false, pro: true, soon: true },
      { key: "crm", free: false, pro: true, soon: true },
    ],
  },
  {
    key: "other",
    rows: [
      { key: "storage", free: "2 GB", pro: "20 GB" },
      { key: "filesize", free: { t: "fileSizeNow" }, pro: { t: "fileSizeNow" } },
      { key: "retention", free: { t: "days90" }, pro: { t: "forever" } },
      { key: "analytics", free: false, pro: true, soon: true },
    ],
  },
];

type ProBulletKey = keyof Dictionary["pricing"]["proBullets"];

/**
 * ข้อดีของ Pro บนการ์ดหน้า /pricing — เรียงของที่ใช้ได้จริงก่อน ของที่ยังไม่มีไว้ท้าย
 *
 * เดิมการ์ดมีห้าข้อ และสี่ข้อในนั้นยังไม่ได้สร้าง (แจ้งเตือน Push/Discord, ประมูล, ธีม, สถิติ)
 * ข้อที่ใช้ได้จริงของ Pro ตอนนี้คือเพดานที่สูงกว่า ซึ่งบังคับอยู่จริงในโค้ด
 * (active_orders, services, storage_bytes) จึงยกขึ้นมาไว้ก่อน
 */
export const PRO_BULLETS: ReadonlyArray<{ key: ProBulletKey; soon?: true }> = [
  { key: "orders" },
  { key: "services" },
  { key: "storage" },
  { key: "notify", soon: true },
  { key: "auctions", soon: true },
  { key: "theme", soon: true },
  { key: "analytics", soon: true },
];
