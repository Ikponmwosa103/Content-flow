import { date, integer, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const usageTable = pgTable(
  "contentflow_usage",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspacesTable.id, { onDelete: "cascade" }),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    generationCount: integer("generation_count").notNull().default(0),
    reservedCount: integer("reserved_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("contentflow_usage_workspace_period_unique").on(
      table.workspaceId,
      table.periodStart,
    ),
  ],
);

export const insertUsageSchema = createInsertSchema(usageTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUsage = z.infer<typeof insertUsageSchema>;
export type Usage = typeof usageTable.$inferSelect;
