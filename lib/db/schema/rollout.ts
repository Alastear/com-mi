import { integer, jsonb, pgTable, primaryKey, text, timestamp, index } from "drizzle-orm/pg-core";
import { creatorPage } from "./app";
import { user } from "./auth";

export const capabilityRollout = pgTable("capability_rollout", {
  capability: text("capability").primaryKey(),
  status: text("status").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const capabilityCohort = pgTable("capability_cohort", {
  capability: text("capability").notNull(),
  creatorPageId: text("creator_page_id").notNull().references(() => creatorPage.id, { onDelete: "cascade" }),
  cohort: text("cohort").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.capability, t.creatorPageId] })]);
export const capabilityAudit = pgTable("capability_audit", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  capability: text("capability").notNull(),
  target: text("target").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("capability_audit_time_idx").on(t.createdAt)]);
