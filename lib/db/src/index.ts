import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
// Export Drizzle operators/types through this package so API code uses the same
// Drizzle installation as the schema and database instance.
export { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
export type { ExtractTablesWithRelations, SQL } from "drizzle-orm";
export type { NodePgTransaction } from "drizzle-orm/node-postgres";
