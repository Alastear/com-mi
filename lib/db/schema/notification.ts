import { relations, sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * การแจ้งเตือนในเว็บ — Phase 1c
 *
 * ⚠️ **ต่างจาก docs/02-data-model.md §9 โดยตั้งใจ**
 * เอกสารออกแบบไว้ให้เก็บ `title` กับ `body` เป็นข้อความสำเร็จรูป
 * แต่แบบนั้นแช่ภาษาไว้ถาวร — ครีเอเตอร์ไทยทำอะไรสักอย่าง แล้วลูกค้าที่ใช้อังกฤษ
 * จะเห็นแจ้งเตือนเป็นภาษาไทยตลอดไป และแก้ย้อนหลังไม่ได้เลยเพราะข้อความถูกเขียนลงไปแล้ว
 *
 * เก็บเป็น `type` + `data` แทน แล้วแปลตอนแสดง — เหมือนที่ `message.eventType` ทำ
 * (ตัดสินใจเดียวกัน เหตุผลเดียวกัน ควรอยู่ข้างกันในหัวคนอ่านโค้ด)
 */
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** ดู NOTIFICATION_TYPES ใน lib/notifications/types.ts */
    type: text("type").notNull(),
    /** ค่าที่ต้องเติมลงในข้อความ เช่น { code: "K7M2QX4P", status: "in_progress" } */
    data: jsonb("data").$type<Record<string, string | number>>().notNull().default({}),

    /** ที่ที่กดแล้วไป — เก็บเป็น path ไม่ใช่ URL เต็ม โดเมนเปลี่ยนแล้วลิงก์เก่าไม่ตาย */
    url: text("url").notNull(),

    entityType: text("entity_type"),
    entityId: text("entity_id"),
    /** คนที่ทำให้เกิดเรื่องนี้ — null เมื่อเป็นระบบ */
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),

    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_user_idx").on(t.userId, t.createdAt.desc()),
    /**
     * partial index เฉพาะที่ยังไม่อ่าน — คิวรีที่ยิงบ่อยที่สุดในระบบ
     * (นับ badge ทุกครั้งที่ poll) และแถวที่อ่านแล้วไม่กินพื้นที่ index เลย
     */
    index("notification_unread_idx")
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.readAt} is null`),
  ],
);

/**
 * สองความสัมพันธ์ชี้ไปตาราง `user` เหมือนกัน จึงต้องตั้ง relationName
 * ไม่งั้น Drizzle แยกไม่ออกว่า `with: { user: true }` หมายถึงอันไหน
 */
export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
    relationName: "notificationRecipient",
  }),
  actor: one(user, {
    fields: [notification.actorUserId],
    references: [user.id],
    relationName: "notificationActor",
  }),
}));

export type Notification = typeof notification.$inferSelect;
