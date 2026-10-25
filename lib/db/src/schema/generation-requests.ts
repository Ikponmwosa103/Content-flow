import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const generationRequestsTable = pgTable(
  "contentflow_generation_requests",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspacesTable.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    // Nullable only for existing request rows created before fingerprints were
    // introduced. Legacy keys are rejected rather than replaying unverified data.
    requestHash: text("request_hash"),
    periodStart: text("period_start").notNull(),
    status: text("status").notNull(),
    response: jsonb("response").$type<{ title: string; body: string } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("contentflow_generation_requests_workspace_key_unique").on(
      table.workspaceId,
      table.requestId,
    ),
    index("contentflow_generation_requests_created_idx").on(table.createdAt),
  ],
);

export const generationAttemptsTable = pgTable(
  "contentflow_generation_attempts",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id")
      .notNull()
      .references(() => workspacesTable.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contentflow_generation_attempts_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const insertGenerationRequestSchema = createInsertSchema(
  generationRequestsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGenerationRequest = z.infer<
  typeof insertGenerationRequestSchema
>;
export type GenerationRequest = typeof generationRequestsTable.$inferSelect;
export type GenerationAttempt = typeof generationAttemptsTable.$inferSelect;
