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
import { creatorPage, media, service } from "./app";

/**
 * ตารางฝั่งออเดอร์ — Phase 1b
 * ตามที่ออกแบบไว้ใน docs/02-data-model.md §4
 *
 * หลักการที่คุมทั้งไฟล์นี้: **ออเดอร์คือหลักฐาน ไม่ใช่ view ของ service**
 * ทุกอย่างที่ลูกค้าเห็นตอนกดสั่งถูก snapshot ลงตารางออเดอร์เป็นข้อความ+ตัวเลข
 * ครีเอเตอร์ขึ้นราคา แก้ชื่อเมนู หรือลบเมนูทิ้งทีหลัง ออเดอร์เก่าต้องยังอ่านได้เหมือนเดิม
 * → ห้าม join กลับไป `service` เพื่อ "แสดงผล" เด็ดขาด (join ได้แค่เพื่อลิงก์ไปดูเมนูปัจจุบัน)
 *
 * เงินเป็น integer หน่วยสตางค์เสมอ
 */

/* ── order ─────────────────────────────────────────────────── */

export const order = pgTable(
  "order",
  {
    id: text("id").primaryKey(),

    /**
     * รหัสที่ใช้ใน URL แทน id — สั้น อ่านออกทางโทรศัพท์ได้
     * ไม่ใช้ id ตรง ๆ เพราะ id เรียงตามเวลา เดาออเดอร์ข้างเคียงได้ง่ายเกินไป
     */
    code: text("code").notNull().unique(),

    creatorPageId: text("creator_page_id")
      .notNull()
      .references(() => creatorPage.id, { onDelete: "cascade" }),
    clientUserId: text("client_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** nullable เพราะเมนูอาจถูกลบทีหลัง — ออเดอร์ต้องไม่หายตาม */
    serviceId: text("service_id").references(() => service.id, { onDelete: "set null" }),

    status: text("status").notNull().default("requested"),

    /** ลากจัดลำดับบนบอร์ดได้ — เลขมากมาก่อน */
    priority: integer("priority").notNull().default(0),
    queuePosition: integer("queue_position"),

    currency: text("currency").notNull().default("THB"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    addonsCents: integer("addons_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    /** รวมจาก payment_record ที่ยืนยันแล้ว — เก็บซ้ำเพื่อไม่ต้อง SUM ทุกครั้งที่แสดงบอร์ด */
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),

    /**
     * มัดจำที่ต้องได้รับก่อนเริ่มลงมือ — 0 = ไม่บังคับ
     *
     * TOS ตั้งต้นที่เราแจกให้ครีเอเตอร์เขียนว่า "ชำระมัดจำ 50% ก่อนเริ่มงาน"
     * แต่เดิม state machine ปล่อยให้ `accepted → in_progress` ผ่านที่ ฿0 ได้
     * ครีเอเตอร์จึงลงมือแล้วโดนเทได้ทั้งที่ข้อตกลงของตัวเองบอกว่าต้องจ่ายก่อน
     * (ดู docs/00 §5.2.1 — นี่คือด่านเดียวที่ครีเอเตอร์มีในโมเดลที่เราไม่ถือเงิน)
     */
    depositCents: integer("deposit_cents").notNull().default(0),

    revisionsUsed: integer("revisions_used").notNull().default(0),
    /** snapshot จากเมนูตอนสั่ง — ครีเอเตอร์ลดจำนวนครั้งทีหลังไม่กระทบออเดอร์นี้ */
    revisionsAllowed: integer("revisions_allowed").notNull().default(0),

    /** หลักฐานว่ายอมรับ TOS ฉบับไหน — พร้อมข้อความฉบับเต็มที่ลูกค้าเห็นตอนนั้น */
    tosSnapshot: jsonb("tos_snapshot").$type<string[]>().notNull().default([]),
    acceptedTosAt: timestamp("accepted_tos_at", { withTimezone: true }),

    dueAt: timestamp("due_at", { withTimezone: true }),
    quoteExpiresAt: timestamp("quote_expires_at", { withTimezone: true }),

    /** โชว์ในคิวสาธารณะแบบไม่ระบุตัวตน — ลูกค้าปิดได้ */
    isPublicInQueue: boolean("is_public_in_queue").notNull().default(true),
    /** โน้ตของครีเอเตอร์ ลูกค้าไม่เห็น — ต้องกรองออกทุกครั้งที่ส่งข้อมูลให้ฝั่งลูกค้า */
    privateNote: text("private_note").notNull().default(""),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("order_page_status_idx").on(t.creatorPageId, t.status, t.createdAt),
    index("order_client_idx").on(t.clientUserId, t.createdAt),
  ],
);

/* ── order_item — snapshot ที่แช่แข็งแล้ว ──────────────────── */

export const orderItem = pgTable(
  "order_item",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),

    /** ข้อความที่ลูกค้าเห็นตอนสั่ง — ไม่ใช่ค่าที่ join มาสด ๆ */
    label: text("label").notNull(),
    /** base | tier | option | custom */
    kind: text("kind").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),

    /** id ของ tier/option ต้นทาง — ใช้อ้างอิงย้อนหลังเท่านั้น ห้ามใช้ตอนแสดงผล */
    sourceId: text("source_id"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("order_item_order_idx").on(t.orderId, t.sortOrder)],
);

/* ── order_answer — คำตอบฟอร์มบรีฟ ─────────────────────────── */

export const orderAnswer = pgTable(
  "order_answer",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),

    fieldKey: text("field_key").notNull(),
    /** เก็บ label ด้วยเหตุผลเดียวกับ order_item — ครีเอเตอร์แก้ฟอร์มได้ */
    fieldLabel: text("field_label").notNull(),
    value: jsonb("value").$type<string | string[] | number | boolean | null>(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("order_answer_order_idx").on(t.orderId, t.sortOrder)],
);

/* ── message — เธรด + timeline ในสตรีมเดียว ────────────────── */

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),

    /** null เมื่อเป็น event ที่ระบบสร้างเอง (เช่น หมดอายุอัตโนมัติ) */
    senderUserId: text("sender_user_id").references(() => user.id, { onDelete: "set null" }),

    body: text("body").notNull().default(""),
    attachmentMediaIds: jsonb("attachment_media_ids").$type<string[]>().notNull().default([]),

    /**
     * true = บันทึกเหตุการณ์ เช่น "เปลี่ยนสถานะเป็น in_progress"
     * ทำให้ timeline กับแชทเป็นสตรีมเดียว UI ไม่ต้อง merge สองแหล่ง
     * eventType เก็บ key ไว้แปลตามภาษา ไม่ได้เก็บข้อความไทย/อังกฤษตายตัว
     */
    isSystemEvent: boolean("is_system_event").notNull().default(false),
    eventType: text("event_type"),
    eventData: jsonb("event_data").$type<Record<string, string | number>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readByCreatorAt: timestamp("read_by_creator_at", { withTimezone: true }),
    readByClientAt: timestamp("read_by_client_at", { withTimezone: true }),
  },
  (t) => [index("message_order_idx").on(t.orderId, t.createdAt)],
);

/* ── payment_record — บันทึกการชำระ ไม่ใช่การประมวลผล ──────── */

/**
 * ⚠️ แพลตฟอร์มไม่ถือเงินเลย เงินโอนตรงจากลูกค้าเข้าบัญชีครีเอเตอร์
 * ตารางนี้เก็บแค่ "บันทึกว่ามีการจ่าย" + สลิป + การกดยืนยันของครีเอเตอร์
 * ซึ่งทำให้ไม่เข้าข่ายธุรกิจ e-payment ที่ต้องขอใบอนุญาต (docs/00 §ธุรกิจ)
 *
 * ออกแบบเผื่อ escrow ไว้แล้ว: เพิ่ม method='stripe_connect' + payment intent id
 * แล้วให้ระบบ verify แทนคน โดยไม่ต้อง migrate โครงสร้าง
 */
export const paymentRecord = pgTable(
  "payment_record",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),

    /** promptpay | bank_transfer | paypal | stripe_link | kofi | other */
    method: text("method").notNull().default("promptpay"),
    amountCents: integer("amount_cents").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),

    proofMediaId: text("proof_media_id").references(() => media.id, { onDelete: "set null" }),

    /** ครีเอเตอร์กดยืนยันว่าเงินเข้าจริง — ตราบใดที่ยัง null จะไม่นับเข้า amountPaidCents */
    verifiedByUserId: text("verified_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    note: text("note").notNull().default(""),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_order_idx").on(t.orderId, t.createdAt)],
);

/* ── delivery ──────────────────────────────────────────────── */

export const delivery = pgTable(
  "delivery",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),

    mediaIds: jsonb("media_ids").$type<string[]>().notNull().default([]),
    note: text("note").notNull().default(""),
    /** personal | commercial | exclusive */
    licenseType: text("license_type").notNull().default("personal"),

    /**
     * null จนกว่า amountPaidCents >= totalCents — signed URL ถึงจะออกให้
     * เป็นด่านเดียวที่กันไฟล์จริงหลุดก่อนจ่ายครบ อย่าย้ายไปเช็คที่ UI
     */
    releasedAt: timestamp("released_at", { withTimezone: true }),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("delivery_order_idx").on(t.orderId)],
);

/* ── review ────────────────────────────────────────────────── */

export const review = pgTable(
  "review",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .unique()
      .references(() => order.id, { onDelete: "cascade" }),
    creatorPageId: text("creator_page_id")
      .notNull()
      .references(() => creatorPage.id, { onDelete: "cascade" }),
    clientUserId: text("client_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    rating: integer("rating").notNull(),
    body: text("body").notNull().default(""),
    isPublic: boolean("is_public").notNull().default(true),
    creatorReply: text("creator_reply").notNull().default(""),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_page_idx").on(t.creatorPageId, t.createdAt)],
);

/* ── rate_limit ────────────────────────────────────────────── */

/**
 * เก็บใน Postgres ไม่ใช่ Redis — ตั้งใจตามที่ตัดสินใจไว้ใน docs/01 §สิ่งที่ไม่ใส่
 * ปริมาณ write ต่ำมาก (เฉพาะตอน submit ฟอร์ม) ไม่คุ้มกับการเพิ่ม vendor
 *
 * หนึ่งแถว = หนึ่งหน้าต่างเวลาของหนึ่ง key (`order:<userId>`, `order:ip:<ip>`)
 * cron รายวันลบแถวที่หน้าต่างหมดอายุแล้ว
 */
export const rateLimit = pgTable(
  "rate_limit",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limit_window_idx").on(t.windowStart)],
);

/* ── relations ─────────────────────────────────────────────── */

export const orderRelations = relations(order, ({ one, many }) => ({
  page: one(creatorPage, { fields: [order.creatorPageId], references: [creatorPage.id] }),
  client: one(user, { fields: [order.clientUserId], references: [user.id] }),
  service: one(service, { fields: [order.serviceId], references: [service.id] }),
  items: many(orderItem),
  answers: many(orderAnswer),
  messages: many(message),
  payments: many(paymentRecord),
  deliveries: many(delivery),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
}));

export const orderAnswerRelations = relations(orderAnswer, ({ one }) => ({
  order: one(order, { fields: [orderAnswer.orderId], references: [order.id] }),
}));

export const messageRelations = relations(message, ({ one }) => ({
  order: one(order, { fields: [message.orderId], references: [order.id] }),
  sender: one(user, { fields: [message.senderUserId], references: [user.id] }),
}));

export const paymentRecordRelations = relations(paymentRecord, ({ one }) => ({
  order: one(order, { fields: [paymentRecord.orderId], references: [order.id] }),
  proof: one(media, { fields: [paymentRecord.proofMediaId], references: [media.id] }),
}));

export const deliveryRelations = relations(delivery, ({ one }) => ({
  order: one(order, { fields: [delivery.orderId], references: [order.id] }),
}));

export const reviewRelations = relations(review, ({ one }) => ({
  order: one(order, { fields: [review.orderId], references: [order.id] }),
  page: one(creatorPage, { fields: [review.creatorPageId], references: [creatorPage.id] }),
  client: one(user, { fields: [review.clientUserId], references: [user.id] }),
}));

export type Order = typeof order.$inferSelect;
export type OrderItem = typeof orderItem.$inferSelect;
export type OrderAnswer = typeof orderAnswer.$inferSelect;
export type Message = typeof message.$inferSelect;
export type PaymentRecord = typeof paymentRecord.$inferSelect;
export type Delivery = typeof delivery.$inferSelect;
export type Review = typeof review.$inferSelect;

/* ── delivery_issuance — ร่องรอยการออก URL ดาวน์โหลด ─────────── */

/**
 * บันทึกทุกครั้งที่มีการออก signed URL ให้ไฟล์ส่งมอบ
 *
 * **นี่คือร่องรอยเดียวที่จะมี** — CDN ของ Blob ไม่ให้ log อะไรเรากลับมาเลย
 * และ signed URL เป็น bearer credential ล้วน ๆ (ทดสอบแล้ว: `fetch()` เปล่า ๆ
 * ไม่มี header อะไรเลยก็ได้ไฟล์) ถ้าวันหนึ่งมีคนบอกว่างานหลุด สิ่งเดียวที่ตอบได้คือ
 * "ออก URL ให้ใคร เมื่อไร กี่ครั้ง" ซึ่งต้องเขียนไว้ตั้งแต่ตอนออก ไม่ใช่ไปหาทีหลัง
 */
export const deliveryIssuance = pgTable(
  "delivery_issuance",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id")
      .notNull()
      .references(() => delivery.id, { onDelete: "cascade" }),
    mediaId: text("media_id").notNull(),
    /** คนที่ขอ URL — ไม่ใช่เจ้าของไฟล์ */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  },
  (t) => [index("delivery_issuance_delivery_idx").on(t.deliveryId, t.issuedAt)],
);

export const deliveryIssuanceRelations = relations(deliveryIssuance, ({ one }) => ({
  delivery: one(delivery, {
    fields: [deliveryIssuance.deliveryId],
    references: [delivery.id],
  }),
  user: one(user, { fields: [deliveryIssuance.userId], references: [user.id] }),
}));

export type DeliveryIssuance = typeof deliveryIssuance.$inferSelect;

/* ── order_quote — ใบเสนอราคาที่ครีเอเตอร์เขียนเอง ────────────── */

/**
 * ใบเสนอราคาหนึ่งใบ = ข้อเสนอหนึ่งครั้ง
 *
 * ⚠️ **ครีเอเตอร์เขียนใบนี้ได้ แต่เขียน `order.totalCents` ไม่ได้**
 * ราคาบนออเดอร์ถูกเขียนตอนลูกค้ากดยอมรับเท่านั้น และการกดนั้นต้องระบุ `quoteId`
 * ที่กำลังยอมรับ — ไม่งั้นครีเอเตอร์ที่แก้ราคาขึ้นตอนลูกค้าเปิดหน้าค้างไว้
 * จะผูกลูกค้ากับตัวเลขที่ไม่เคยอ่าน แถวที่ตั้งราคาจึงต้องเป็นแถวเดียวกับ
 * ที่บันทึกว่าใครตกลงอะไรเมื่อไร
 *
 * แก้ราคาใหม่ = ออกใบใหม่แล้วปิดใบเก่า ไม่ใช่เขียนทับ — ประวัติการต่อรองจึงอ่านย้อนได้
 */
export const orderQuote = pgTable(
  "order_quote",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull(),

    /** บรรทัดราคาในรูปเดียวกับที่ `order_item` ต้องการ — ตอนยอมรับคือคัดลอก ไม่ใช่แปลง */
    lines: jsonb("lines").$type<Array<{ label: string; amountCents: number }>>().notNull(),

    subtotalCents: integer("subtotal_cents").notNull(),
    addonsCents: integer("addons_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    /** มัดจำที่ต้องจ่ายก่อนเริ่มงาน — 0 = ไม่บังคับมัดจำ */
    depositCents: integer("deposit_cents").notNull().default(0),

    note: text("note").notNull().default(""),

    /** หมดอายุแล้วกดยอมรับไม่ได้ — ครีเอเตอร์จะได้ไม่ติดราคาเก่าตลอดกาล */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** ออกใบใหม่ทับ — ใบเก่ายังอยู่เพื่อให้ย้อนอ่านได้ แต่กดยอมรับไม่ได้แล้ว */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_quote_order_idx").on(t.orderId, t.createdAt),
    /**
     * ใบที่ยังเปิดอยู่มีได้ใบเดียวต่อออเดอร์
     * partial unique — ใบที่ถูกปิดหรือยอมรับไปแล้วไม่กินโควตานี้
     */
    uniqueIndex("order_quote_live_idx")
      .on(t.orderId)
      .where(sql`${t.supersededAt} is null and ${t.acceptedAt} is null`),
  ],
);

export const orderQuoteRelations = relations(orderQuote, ({ one }) => ({
  order: one(order, { fields: [orderQuote.orderId], references: [order.id] }),
}));
