import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * ตารางฝั่งโดเมน — Phase 1a (หน้าร้าน)
 * ตามที่ออกแบบไว้ใน docs/02-data-model.md §3
 *
 * ⚠️ ต่างจากเอกสารหนึ่งจุดโดยตั้งใจ: `handle` อยู่บน `user` ไม่ใช่ `creator_page`
 *    เพราะ Phase 0 ใส่ไว้ที่นั่นแล้วเพื่อให้อ่านได้จาก session cookie cache
 *    ถ้าเก็บสองที่จะต้องคอย sync กันเอง ซึ่งพังง่ายกว่าที่ได้ประโยชน์
 *
 * เงินเก็บเป็น integer หน่วยสตางค์เสมอ — ห้ามใช้ float กับเงิน
 */

/* ── media ─────────────────────────────────────────────────── */

export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** ใช้ตอนลบไฟล์ออกจาก Blob store */
    pathname: text("pathname").notNull(),
    url: text("url").notNull(),
    access: text("access").notNull().default("public"),

    kind: text("kind").notNull(), // avatar | banner | portfolio | service_cover | reference | wip | final
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull().default(0),
    width: integer("width"),
    height: integer("height"),

    /** ~28 bytes → ใช้เป็น placeholder ตอนโหลด โดยไม่ต้องยิง request เพิ่ม */
    thumbhash: text("thumbhash"),

    variantOf: text("variant_of"),
    variantLabel: text("variant_label"), // thumb | display | original

    /**
     * orphan = อัปโหลดแล้วแต่ผู้ใช้ยังไม่ submit → cron เก็บกวาดทีหลัง
     * linked  = ผูกกับ record จริงแล้ว
     */
    status: text("status").notNull().default("orphan"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_owner_status_idx").on(t.ownerUserId, t.status, t.createdAt)],
);

/* ── creator_page ──────────────────────────────────────────── */

export const creatorPage = pgTable("creator_page", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),

  displayName: text("display_name").notNull(),
  tagline: text("tagline").notNull().default(""),
  about: text("about").notNull().default(""),

  bannerMediaId: text("banner_media_id").references(() => media.id, { onDelete: "set null" }),
  avatarMediaId: text("avatar_media_id").references(() => media.id, { onDelete: "set null" }),

  /** open | closed | waitlist | vacation — ข้อมูลชิ้นที่คนดูหน้าร้านมองหาเป็นอันดับแรก */
  status: text("status").notNull().default("open"),
  statusNote: text("status_note").notNull().default(""),

  currency: text("currency").notNull().default("THB"),

  /** ข้อตกลงรับงาน เก็บเป็นข้อ ๆ */
  tos: jsonb("tos").$type<string[]>().notNull().default([]),
  /** เพิ่มทุกครั้งที่แก้ TOS — ผูกกับ order.tosVersionAccepted เพื่อเป็นหลักฐาน */
  tosVersion: integer("tos_version").notNull().default(1),

  socials: jsonb("socials").$type<Array<{ platform: string; url: string }>>().notNull().default([]),
  theme: jsonb("theme").$type<Record<string, string>>().notNull().default({}),

  isMature: boolean("is_mature").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(false),
  showQueuePublicly: boolean("show_queue_publicly").notNull().default(true),

  slotsTotal: integer("slots_total").notNull().default(5),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── service ───────────────────────────────────────────────── */

export const service = pgTable(
  "service",
  {
    id: text("id").primaryKey(),
    creatorPageId: text("creator_page_id")
      .notNull()
      .references(() => creatorPage.id, { onDelete: "cascade" }),

    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),

    kind: text("kind").notNull().default("illustration"),
    /** instant = ราคาตายตัวจ่ายแล้วเข้าคิว · proposal = ครีเอเตอร์เสนอราคาก่อน */
    mode: text("mode").notNull().default("instant"),

    basePriceCents: integer("base_price_cents").notNull().default(0),
    deliveryDays: integer("delivery_days").notNull().default(7),
    revisionsIncluded: integer("revisions_included").notNull().default(2),

    coverMediaId: text("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    includes: jsonb("includes").$type<string[]>().notNull().default([]),

    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    /** soft delete — ออเดอร์เก่ายังอ้างถึง service นี้อยู่ */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("service_page_slug_idx").on(t.creatorPageId, t.slug),
    index("service_page_sort_idx").on(t.creatorPageId, t.sortOrder),
  ],
);

/** ระดับความละเอียด เช่น sketch / flat / full render */
export const serviceTier = pgTable(
  "service_tier",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    previewMediaId: text("preview_media_id").references(() => media.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("service_tier_service_idx").on(t.serviceId, t.sortOrder)],
);

export const serviceOption = pgTable(
  "service_option",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),
    groupLabel: text("group_label").notNull().default(""),
    label: text("label").notNull(),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    /** checkbox | quantity */
    inputType: text("input_type").notNull().default("checkbox"),
    maxQuantity: integer("max_quantity"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("service_option_service_idx").on(t.serviceId, t.sortOrder)],
);

/* ── portfolio ─────────────────────────────────────────────── */

export const portfolioItem = pgTable(
  "portfolio_item",
  {
    id: text("id").primaryKey(),
    creatorPageId: text("creator_page_id")
      .notNull()
      .references(() => creatorPage.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),

    title: text("title").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),

    /** กดจากผลงานไปสั่งงานแบบเดียวกันได้เลย — ทางลัดที่เพิ่ม conversion */
    linkedServiceId: text("linked_service_id").references(() => service.id, {
      onDelete: "set null",
    }),

    sortOrder: integer("sort_order").notNull().default(0),
    isFeatured: boolean("is_featured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("portfolio_page_sort_idx").on(t.creatorPageId, t.sortOrder)],
);

/* ── relations (ให้ db.query.<table>.findFirst({ with: … }) ใช้ได้) ── */

export const creatorPageRelations = relations(creatorPage, ({ one, many }) => ({
  user: one(user, { fields: [creatorPage.userId], references: [user.id] }),
  banner: one(media, { fields: [creatorPage.bannerMediaId], references: [media.id] }),
  avatar: one(media, { fields: [creatorPage.avatarMediaId], references: [media.id] }),
  services: many(service),
  portfolio: many(portfolioItem),
}));

export const serviceRelations = relations(service, ({ one, many }) => ({
  page: one(creatorPage, { fields: [service.creatorPageId], references: [creatorPage.id] }),
  cover: one(media, { fields: [service.coverMediaId], references: [media.id] }),
  tiers: many(serviceTier),
  options: many(serviceOption),
}));

export const serviceTierRelations = relations(serviceTier, ({ one }) => ({
  service: one(service, { fields: [serviceTier.serviceId], references: [service.id] }),
  preview: one(media, { fields: [serviceTier.previewMediaId], references: [media.id] }),
}));

export const serviceOptionRelations = relations(serviceOption, ({ one }) => ({
  service: one(service, { fields: [serviceOption.serviceId], references: [service.id] }),
}));

export const portfolioItemRelations = relations(portfolioItem, ({ one }) => ({
  page: one(creatorPage, { fields: [portfolioItem.creatorPageId], references: [creatorPage.id] }),
  media: one(media, { fields: [portfolioItem.mediaId], references: [media.id] }),
  linkedService: one(service, {
    fields: [portfolioItem.linkedServiceId],
    references: [service.id],
  }),
}));

export type CreatorPage = typeof creatorPage.$inferSelect;
export type Service = typeof service.$inferSelect;
export type ServiceTier = typeof serviceTier.$inferSelect;
export type ServiceOption = typeof serviceOption.$inferSelect;
export type PortfolioItem = typeof portfolioItem.$inferSelect;
export type Media = typeof media.$inferSelect;
