import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * ตารางที่ Better Auth ต้องการ
 *
 * ชื่อ property ฝั่ง JS ต้องตรงกับที่ Better Auth คาดไว้เป๊ะ ๆ (emailVerified, userId, …)
 * เพราะ adapter จับคู่ด้วยชื่อ property ไม่ใช่ชื่อคอลัมน์
 * ส่วนชื่อคอลัมน์ใน DB ใช้ snake_case ตามธรรมเนียม Postgres ได้ตามปกติ
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),

  // ── additionalFields (ดู lib/auth.ts) ────────────────────────
  // อยู่บน user ไม่ใช่ตารางแยก เพื่อให้อ่านได้จาก session cookie cache โดยไม่ต้อง join
  /** ชื่อใน URL `/@handle` — null จนกว่าจะทำ onboarding เสร็จ */
  handle: text("handle").unique(),
  plan: text("plan").notNull().default("free"),
  planUntil: timestamp("plan_until", { withTimezone: true }),
  role: text("role").notNull().default("user"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  /** ไม่ได้ใช้ — เปิดเฉพาะ Google OAuth ไม่มี email+password */
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
