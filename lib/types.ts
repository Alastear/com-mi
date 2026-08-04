import type { Route } from "next";

/**
 * ชนิดข้อมูลสำหรับ prototype — สะท้อน schema ใน docs/02-data-model.md
 * ตอนต่อ Drizzle จริงให้ derive จาก `InferSelectModel` แทนไฟล์นี้
 */

export type ShopStatus = "open" | "closed" | "waitlist" | "vacation";

export type ServiceKind =
  | "illustration"
  | "emote"
  | "chibi"
  | "reference_sheet"
  | "animation"
  | "video_edit"
  | "model_3d"
  | "live2d"
  | "adopt"
  | "ych"
  | "design"
  | "other";

export type ServiceMode = "instant" | "proposal";

export type OrderStatus =
  | "requested"
  | "reviewing"
  | "quoted"
  | "accepted"
  | "in_progress"
  | "in_review"
  | "revision_requested"
  | "delivered"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

/** คอลัมน์ที่แสดงบนบอร์ด — สถานะ terminal ไม่ขึ้นบอร์ด */
export const BOARD_COLUMNS = [
  "requested",
  "quoted",
  "in_progress",
  "in_review",
  "delivered",
] as const satisfies readonly OrderStatus[];

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** สถานะที่ถือว่า "active" — ใช้นับโควตาแพ็กเกจ */
export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  "requested",
  "reviewing",
  "quoted",
  "accepted",
  "in_progress",
  "in_review",
  "revision_requested",
];

export type Creator = {
  handle: string;
  displayName: string;
  tagline: string;
  about: string;
  status: ShopStatus;
  statusNote?: string;
  currency: string;
  avatarSeed: string;
  bannerSeed: string;
  socials: Array<{ platform: string; url: string }>;
  rating: number;
  reviewCount: number;
  completedCount: number;
  avgDeliveryDays: number;
  queueCount: number;
  slotsTotal: number;
  isMature: boolean;
  tos: string[];
};

export type ServiceTier = {
  id: string;
  label: string;
  priceDeltaCents: number;
  previewSeed: string;
};

export type ServiceOption = {
  id: string;
  groupLabel: string;
  label: string;
  priceDeltaCents: number;
  inputType: "checkbox" | "quantity";
  maxQuantity?: number;
};

export type Service = {
  id: string;
  slug: string;
  title: string;
  description: string;
  kind: ServiceKind;
  mode: ServiceMode;
  basePriceCents: number;
  deliveryDays: number;
  revisionsIncluded: number;
  coverSeed: string;
  gallerySeeds: string[];
  includes: string[];
  tiers: ServiceTier[];
  options: ServiceOption[];
};

export type PortfolioItem = {
  id: string;
  title: string;
  seed: string;
  /** อัตราส่วนภาพ — ใช้ทำ masonry ให้ความสูงไม่เท่ากันเหมือนของจริง */
  ratio: number;
  tags: string[];
  linkedServiceSlug?: string;
};

export type Review = {
  id: string;
  clientName: string;
  clientSeed: string;
  rating: number;
  body: string;
  serviceTitle: string;
  createdAt: string;
};

export type TimelineEntry = {
  id: string;
  kind: "message" | "event";
  author: "creator" | "client" | "system";
  authorName: string;
  body: string;
  createdAt: string;
  attachments?: Array<{ seed: string; label: string }>;
};

export type Order = {
  code: string;
  clientName: string;
  clientSeed: string;
  serviceTitle: string;
  serviceSlug: string;
  kind: ServiceKind;
  status: OrderStatus;
  coverSeed: string;
  totalCents: number;
  paidCents: number;
  currency: string;
  createdAt: string;
  dueAt?: string;
  quoteExpiresAt?: string;
  revisionsUsed: number;
  revisionsAllowed: number;
  unreadCount: number;
  progressPercent: number;
  privateNote?: string;
  lineItems: Array<{ label: string; priceCents: number }>;
  brief: Array<{ label: string; value: string }>;
  timeline: TimelineEntry[];
  referenceSeeds: string[];
  wipSeeds: string[];
  finalSeeds: string[];
};

export type NotificationItem = {
  id: string;
  type: "order" | "message" | "payment" | "system";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** typedRoutes เปิดอยู่ — ลิงก์ต้องเป็น route ที่มีจริงเท่านั้น */
  href: Route;
};
