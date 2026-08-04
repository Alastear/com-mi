/**
 * แหล่งความจริงเดียวของแพ็กเกจและลิมิต
 * ตรงกับ docs/03-plans-and-entitlements.md §4.1
 *
 * ตอนต่อของจริง: `can()` / `limitOf()` ต้องเป็น synchronous ล้วน
 * เพราะ plan อยู่ใน session cookie cache แล้ว (ไม่มี I/O)
 */

export const FEATURES = [
  "push_notifications",
  "discord_webhook",
  "line_notify",
  "instant_email",
  "milestones",
  "custom_form",
  "conditional_fields",
  "auctions",
  "custom_theme",
  "hide_badge",
  "custom_domain",
  "analytics",
  "crm",
  "export",
  "invoice_pdf",
  "calendar",
  "waitlist_broadcast",
  "notification_prefs",
  "team_seats",
  "api_access",
] as const;
export type Feature = (typeof FEATURES)[number];

export type Limits = {
  active_orders: number;
  orders_per_month: number;
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
      // ตัดสินใจไว้ที่ 5 (เดิมเสนอ 3) — free tier ต้องใช้จริงได้ไม่อึดอัด
      active_orders: 5,
      orders_per_month: 20,
      services: 5,
      portfolio_items: 12,
      storage_bytes: 300 * MB,
      file_size_bytes: 20 * MB,
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
      "line_notify",
      "instant_email",
      "milestones",
      "custom_form",
      "conditional_fields",
      "auctions",
      "custom_theme",
      "hide_badge",
      "analytics",
      "crm",
      "export",
      "invoice_pdf",
      "calendar",
      "waitlist_broadcast",
      "notification_prefs",
    ]),
    limits: {
      active_orders: UNLIMITED,
      orders_per_month: UNLIMITED,
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
      orders_per_month: UNLIMITED,
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
 *   "300 MB"            → ข้อความที่ไม่ต้องแปล (ตัวเลข หน่วย)
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
      { key: "portfolio", free: "12", pro: "300" },
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
      { key: "storage", free: "300 MB", pro: "20 GB" },
      { key: "filesize", free: "20 MB", pro: "200 MB" },
      { key: "retention", free: { t: "days90" }, pro: { t: "forever" } },
      { key: "analytics", free: false, pro: true },
    ],
  },
];
