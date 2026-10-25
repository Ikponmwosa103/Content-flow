import {
  integer,
  foreignKey,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { brandsTable } from "./brands";
import { workspacesTable } from "./workspaces";

export const contentsTable = pgTable("contentflow_contents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),
  brandId: integer("brand_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  platform: text("platform").notNull(),
  contentType: text("content_type").notNull(),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  foreignKey({
    name: "contentflow_contents_brand_workspace_fk",
    columns: [table.brandId, table.workspaceId],
    foreignColumns: [brandsTable.id, brandsTable.workspaceId],
  }).onDelete("cascade"),
]);

export const insertContentSchema = createInsertSchema(contentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContent = z.infer<typeof insertContentSchema>;
export type Content = typeof contentsTable.$inferSelect;
