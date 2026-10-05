import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { creatorPage } from "./app";
import { user } from "./auth";

/** Private to one shop/client relationship; never expose through public payloads. */
export const clientProfile = pgTable("client_profile", {
  creatorPageId: text("creator_page_id").notNull().references(() => creatorPage.id, { onDelete: "cascade" }),
  clientUserId: text("client_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  note: text("note").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.creatorPageId, t.clientUserId] })]);
