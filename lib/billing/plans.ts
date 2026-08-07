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

export type ComparisonGroup = {
  key: GroupKey;
  rows: Array<{ key: RowKey; free: CompareValue; pro: CompareValue }>;
};

const UNLIMITED_CELL = { t: "unlimited" } as const;

export const COMPARISON: ComparisonGroup[] = [
  {
    key: "shop",
    rows: [
      { key: "shop", free: true, pro: true },
      { key: "portfolio", free: "30", pro: "300" },
      { key: "theme", free: { t: "presets3" }, pro: true },
      { key: "badge", free: false, pro: true },
    ],
  },
  {
    key: "menu",
    rows: [
      { key: "services", free: "5", pro: UNLIMITED_CELL },
      { key: "active", free: "5", pro: UNLIMITED_CELL },
      { key: "form", free: { t: "presets3" }, pro: { t: "fullyCustom" } },
      { key: "milestone", free: false, pro: true },
    ],
  },
  {
    key: "notify",
    rows: [
      { key: "inapp", free: true, pro: true },
      { key: "email", free: { t: "dailyDigest" }, pro: { t: "instant" } },
      { key: "push", free: false, pro: true },
      { key: "discord", free: false, pro: true },
    ],
  },
  {
    key: "adopts",
    rows: [
      { key: "listing", free: "3", pro: UNLIMITED_CELL },
      { key: "auction", free: false, pro: true },
      { key: "waitlist", free: false, pro: true },
      { key: "crm", free: false, pro: true },
    ],
  },
  {
    key: "other",
    rows: [
      { key: "storage", free: "2 GB", pro: "20 GB" },
      { key: "filesize", free: "50 MB", pro: "200 MB" },
      { key: "retention", free: { t: "days90" }, pro: { t: "forever" } },
      { key: "analytics", free: false, pro: true },
    ],
  },
];
