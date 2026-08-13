import { relations, sql } from "drizzle-orm";
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
     * ไฟล์นี้ผูกกับออเดอร์ไหน — ใช้กับ reference / wip / final / payment_proof
     *
     * ⚠️ ประกาศเป็นคอลัมน์เปล่า **ไม่ใส่ `.references()`**
     * ตาราง `order` import `media` จากไฟล์นี้อยู่แล้ว ถ้าอ้างกลับจะเป็น circular import
     * ระหว่างสอง schema module — FK จริงเติมด้วยมือใน migration SQL แทน
     *
     * ยังจำเป็นถึงแม้ `delivery.mediaIds` จะมีอยู่ เพราะต้องตอบคำถาม
     * "ไฟล์นี้เป็นของออเดอร์ไหน" จากฝั่งไฟล์ เช่นตอนตรวจสิทธิ์ก่อนออก signed URL
     * และตอน cron เก็บกวาดไฟล์ของออเดอร์ที่ถูกยกเลิก
     */
    orderId: text("order_id"),

    /** WIP ที่ฝังลายน้ำแล้ว — กันการเผลอส่งไฟล์ที่ยังไม่ได้ใส่ลายน้ำให้ลูกค้า */
    isWatermarked: boolean("is_watermarked").notNull().default(false),

    /** ความยาววิดีโอเป็นวินาที — null เมื่อเป็นรูป */
    durationSeconds: integer("duration_seconds"),

    /**
     * ภาพปกของวิดีโอ — เก็บเป็นคอลัมน์ ไม่ใช่แถว media แยก
     *
     * เคยคิดจะใช้ `variantOf` ตามที่ schema เตรียมไว้ แต่ภาพปกไม่มีชีวิตของตัวเอง
     * มันเกิดพร้อมวิดีโอ ตายพร้อมวิดีโอ และไม่มีใครอยากได้มันเดี่ยว ๆ
     * แยกเป็นแถวแปลว่าต้อง join ทุกครั้งที่วาดกริด และต้องคอยลบให้ครบสองที่
     */
    posterUrl: text("poster_url"),
    posterPathname: text("poster_pathname"),

    /**
     * ชื่อไฟล์ที่คนอ่านออก — pathname ใน Blob เป็น id ล้วนโดยตั้งใจ
     * ชื่อไฟล์ไทยหรือมีอักขระพิเศษไม่ควรไปอยู่ใน URL และ `mediaId` คือสิ่งเดียว
     * ที่ฝั่ง client ถืออยู่ ดังนั้นชื่อสำหรับแสดงต้องเก็บแยกไว้ที่นี่
     */
    filename: text("filename").notNull().default(""),

    /**
     * orphan = อัปโหลดแล้วแต่ผู้ใช้ยังไม่ submit → cron เก็บกวาดทีหลัง
     * linked  = ผูกกับ record จริงแล้ว
     */
    status: text("status").notNull().default("orphan"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("media_owner_status_idx").on(t.ownerUserId, t.status, t.createdAt),
    // "ไฟล์ของออเดอร์นี้ ชนิดนี้ มีอะไรบ้าง" — ใช้ทุกครั้งที่เปิดหน้าออเดอร์
    index("media_order_kind_idx").on(t.orderId, t.kind),
  ],
);

/* ── creator_page ──────────────────────────────────────────── */

export const creatorPage = pgTable(
  "creator_page",
  {
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

  socials: jsonb("socials").$type<Array<{ platform: string; url: string }>>().notNull().default([]),

    /**
     * ร้านตัวอย่างที่ seed ไว้ให้กดดูจากหน้าแรก
     * ต้องไม่โผล่ในหน้าค้นหาครีเอเตอร์และไม่เข้า sitemap — เปิดตรงด้วย URL ได้อย่างเดียว
     * ไม่งั้น marketplace จะดูเหมือนมีคนใช้ทั้งที่ยังไม่มี และ Google จะ index ร้านที่ไม่มีตัวตนจริง
     */
    isDemo: boolean("is_demo").notNull().default(false),

    /**
     * ช่องทางรับเงิน — แพลตฟอร์มไม่ถือเงิน ลูกค้าโอนตรงเข้าบัญชีครีเอเตอร์
     * promptpayType: phone | national_id | ewallet
     * promptpayName เก็บไว้ให้ผู้ใช้ตรวจสอบเองว่าชื่อในแอปธนาคารตรงกับที่คาด
     */
    promptpayType: text("promptpay_type"),
    promptpayId: text("promptpay_id"),
    promptpayName: text("promptpay_name"),

    /**
     * เบอร์ติดต่อของครีเอเตอร์ — **ไว้ให้ผู้ดูแลติดต่อกลับเท่านั้น**
     *
     * ไม่ใช่ปัจจัยล็อกอิน ไม่ใช่ช่องทาง OTP และไม่โผล่บนหน้าร้าน
     * แยกจาก `promptpayId` โดยตั้งใจถึงแม้ส่วนใหญ่จะเป็นเบอร์เดียวกัน —
     * เลขรับเงินเปลี่ยนได้ตามบัญชีที่ใช้ ส่วนเบอร์ติดต่อคือตัวคน
     * และการรวมสองอย่างเข้าด้วยกันแปลว่าเปลี่ยนบัญชีรับเงินแล้วติดต่อไม่ได้
     *
     * ⚠️ ต้องอยู่ในรายการที่ตัดออกใน `getShopByHandle` เสมอ (ดูเหตุผลที่นั่น)
     */
    contactPhone: text("contact_phone"),

    /**
     * ร้านถูกผู้ดูแลระงับเมื่อไร — null = ปกติ
     *
     * ⚠️ **แยกจาก `isPublished` และ `status` โดยเด็ดขาด** สองอันนั้นเป็นของครีเอเตอร์
     * ถ้าผู้ดูแลไปพลิก `isPublished` ครีเอเตอร์ก็พลิกกลับได้ทันทีจากหน้าร้านตัวเอง
     * และเรายังทับสถานะที่เขาตั้งไว้เองทิ้งโดยไม่มีทางคืนค่าเดิม
     *
     * ระงับร้าน = ปิดการรับงานใหม่และซ่อนจากหน้าค้นหา — **ไม่แตะออเดอร์ที่ค้างอยู่**
     * ลูกค้าที่จ่ายเงินไปแล้วต้องได้ไฟล์เสมอ ไม่ว่าใครจะถูกลงโทษ
     */
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedBy: text("suspended_by"),
    suspensionReason: text("suspension_reason").notNull().default(""),
  theme: jsonb("theme").$type<Record<string, string>>().notNull().default({}),

  isMature: boolean("is_mature").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(false),
  showQueuePublicly: boolean("show_queue_publicly").notNull().default(true),

  slotsTotal: integer("slots_total").notNull().default(5),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * หน้าค้นหาครีเอเตอร์: `where is_published and not is_demo order by updated_at desc`
     *
     * partial index — เก็บเฉพาะแถวที่หน้าค้นหาสนใจจริง
     * ร้านที่ยังไม่เผยแพร่และร้านตัวอย่างไม่กินพื้นที่ index เลย
     * และ planner ใช้ตัวเดียวได้ทั้งกรองและเรียง ไม่ต้อง sort ทีหลัง
     *
     * เพิ่มตอนตารางยังว่างโดยตั้งใจ — ทำทีหลังต้องล็อกตารางที่มีข้อมูลจริง
     */
    index("creator_page_public_idx")
      .on(t.updatedAt.desc())
      .where(sql`${t.isPublished} and not ${t.isDemo}`),
  ],
);

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
    /**
     * ตัวกรองหมวดบนหน้าค้นหา — หา creator_page_id ของร้านที่มีเมนูชนิดนี้
     * partial เพราะหน้าค้นหาไม่เคยสนใจเมนูที่ปิดอยู่หรือถูกลบไปแล้ว
     */
    index("service_kind_idx")
      .on(t.kind, t.creatorPageId)
      .where(sql`${t.isActive} and ${t.deletedAt} is null`),
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
    /**
     * ตัวคูณเป็น basis point — 10000 = x1.0, 15000 = x1.5, 20000 = x2.0
     *
     * **0 = ไม่ใช่ตัวเลือกแบบคูณ** ให้ใช้ `priceDeltaCents` ตามปกติ
     * ค่าที่ไม่เกิน 10000 ก็ถูกมองเป็นแบบบวกเงินเช่นกัน (คูณแล้วราคาลดไม่มีความหมาย)
     * ที่ต้องมีเพราะค่าใช้เชิงพาณิชย์คิดเป็น "เท่า" ของค่างาน ไม่ใช่เงินก้อนคงที่ —
     * ชิบิ 450 บาทกับภาพเต็มตัว 1,500 บาทไม่ควรจ่ายค่าสิทธิ์เท่ากัน
     *
     * เก็บเป็นจำนวนเต็มไม่ใช่ทศนิยม เพราะเงินทั้งระบบเป็น integer สตางค์
     * float ตัวเดียวที่หลุดเข้ามาจะทำให้ยอดฝั่งลูกค้ากับฝั่งเซิร์ฟเวอร์ต่างกันได้
     */
    priceMultiplierBp: integer("price_multiplier_bp").notNull().default(0),
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
    /** null เมื่อผลงานชิ้นนี้เป็นลิงก์วิดีโอภายนอก (ดู embedRef) */
    mediaId: text("media_id").references(() => media.id, { onDelete: "cascade" }),

    title: text("title").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),

    /**
     * วิดีโอจากภายนอก เก็บเป็น `provider:id` เช่น `youtube:dQw4w9WgXcQ`
     * ไม่เก็บ URL ทั้งก้อน — ประกอบใหม่จาก id ตอนแสดงผลเสมอ (lib/media/embed.ts)
     * ผลงานหนึ่งชิ้นเป็นได้อย่างเดียว: ไฟล์ที่อัปเอง หรือลิงก์ภายนอก
     */
    embedRef: text("embed_ref"),

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

/* ── admin_action — บันทึกสิ่งที่ผู้ดูแลทำ ─────────────────── */

/**
 * ประวัติการใช้อำนาจของผู้ดูแล
 *
 * มีตั้งแต่วันแรกที่มีปุ่มระงับ ไม่ใช่ค่อยเพิ่มทีหลัง — การกระทำที่ย้อนกลับไม่ได้
 * และตอบไม่ได้ว่าใครทำเมื่อไรเพราะอะไร คือสิ่งที่แก้ย้อนหลังไม่ได้จริง ๆ
 * ต่อให้ตอนนี้มีผู้ดูแลคนเดียวก็ตาม
 *
 * ไม่ผูก FK ไปที่เป้าหมาย เพราะเป้าหมายอาจถูกลบทีหลัง แต่บันทึกต้องอยู่ต่อ
 */
export const adminAction = pgTable(
  "admin_action",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),

    /** suspend_shop | unsuspend_shop | suspend_user | unsuspend_user */
    action: text("action").notNull(),
    /** shop | user */
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    /** ข้อความที่ผู้ดูแลพิมพ์ตอนกด — บังคับให้มี ไม่ใช่ทางเลือก */
    reason: text("reason").notNull().default(""),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_action_target_idx").on(t.targetType, t.targetId, t.createdAt)],
);
