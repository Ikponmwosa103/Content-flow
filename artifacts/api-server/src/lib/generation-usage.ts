import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import {
  db,
  generationAttemptsTable,
  generationRequestsTable,
  usageTable,
} from "@workspace/db";
import * as schema from "@workspace/db/schema";
import type { GeneratedDraft } from "./ai-provider";
import type { PlanOption } from "./plans";
import { currentPeriodStart } from "./usage-period";

type GenerationTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export const GENERATION_RATE_LIMIT = 5;
export const GENERATION_RATE_WINDOW_MS = 60_000;
export const GENERATION_ATTEMPT_RETENTION_MS = 24 * 60 * 60_000;
export const GENERATION_RESERVATION_TIMEOUT_MS = 5 * 60_000;

export type ReservationResult =
  | { kind: "reserved"; periodStart: string }
  | { kind: "cached"; result: GeneratedDraft; periodStart: string }
  | { kind: "in_progress" }
  | { kind: "idempotency_conflict" }
  | { kind: "quota_exhausted"; limit: number }
  | { kind: "rate_limited"; retryAfterSeconds: number };

async function lockWorkspaceGeneration(
  tx: GenerationTransaction,
  workspaceId: number,
) {
  // A transaction-scoped advisory lock coordinates quota and rate-limit
  // decisions across server processes and deployment instances.
  await tx.execute(sql`select pg_advisory_xact_lock(44110, ${workspaceId})`);
}

async function expireStaleReservations(
  tx: GenerationTransaction,
  workspaceId: number,
  now: Date,
): Promise<void> {
  const expiredBefore = new Date(
    now.getTime() - GENERATION_RESERVATION_TIMEOUT_MS,
  );
  const expired = await tx
    .select({
      id: generationRequestsTable.id,
      periodStart: generationRequestsTable.periodStart,
    })
    .from(generationRequestsTable)
    .where(
      and(
        eq(generationRequestsTable.workspaceId, workspaceId),
        eq(generationRequestsTable.status, "pending"),
        lt(generationRequestsTable.updatedAt, expiredBefore),
      ),
    )
    .for("update");

  if (!expired.length) return;

  await tx
    .update(generationRequestsTable)
    .set({ status: "failed", response: null, updatedAt: now })
    .where(
      and(
        inArray(
          generationRequestsTable.id,
          expired.map((request) => request.id),
        ),
        eq(generationRequestsTable.status, "pending"),
      ),
    );

  const expiredByPeriod = new Map<string, number>();
  for (const request of expired) {
    expiredByPeriod.set(
      request.periodStart,
      (expiredByPeriod.get(request.periodStart) ?? 0) + 1,
    );
  }

  for (const [periodStart, expiredCount] of expiredByPeriod) {
    await tx
      .update(usageTable)
      .set({
        reservedCount: sql`GREATEST(${usageTable.reservedCount} - ${expiredCount}, 0)`,
        updatedAt: now,
      })
      .where(
        and(
          eq(usageTable.workspaceId, workspaceId),
          eq(usageTable.periodStart, periodStart),
        ),
      );
  }
}

async function checkBurstLimit(
  tx: GenerationTransaction,
  workspaceId: number,
  now: Date,
): Promise<number | null> {
  const windowStart = new Date(now.getTime() - GENERATION_RATE_WINDOW_MS);
  const [attemptCount] = await tx
    .select({ total: count() })
    .from(generationAttemptsTable)
    .where(
      and(
        eq(generationAttemptsTable.workspaceId, workspaceId),
        gte(generationAttemptsTable.createdAt, windowStart),
      ),
    );

  if ((attemptCount?.total ?? 0) < GENERATION_RATE_LIMIT) {
    return null;
  }

  const [oldest] = await tx
    .select({ createdAt: generationAttemptsTable.createdAt })
    .from(generationAttemptsTable)
    .where(
      and(
        eq(generationAttemptsTable.workspaceId, workspaceId),
        gte(generationAttemptsTable.createdAt, windowStart),
      ),
    )
    .orderBy(asc(generationAttemptsTable.createdAt))
    .limit(1);

  const oldestAt = oldest?.createdAt.getTime() ?? now.getTime();
  return Math.max(
    1,
    Math.ceil(
      (oldestAt + GENERATION_RATE_WINDOW_MS - now.getTime()) / 1000,
    ),
  );
}

export async function reserveGeneration(input: {
  workspaceId: number;
  requestId: string;
  requestHash: string;
  plan: PlanOption;
  now?: Date;
}): Promise<ReservationResult> {
  const now = input.now ?? new Date();
  const periodStart = currentPeriodStart(now);

  return db.transaction(async (tx) => {
    await lockWorkspaceGeneration(tx, input.workspaceId);
    await expireStaleReservations(tx, input.workspaceId, now);

    await tx
      .delete(generationAttemptsTable)
      .where(
        and(
          eq(generationAttemptsTable.workspaceId, input.workspaceId),
          lt(
            generationAttemptsTable.createdAt,
            new Date(now.getTime() - GENERATION_ATTEMPT_RETENTION_MS),
          ),
        ),
      );

    const [existing] = await tx
      .select()
      .from(generationRequestsTable)
      .where(
        and(
          eq(generationRequestsTable.workspaceId, input.workspaceId),
          eq(generationRequestsTable.requestId, input.requestId),
        ),
      )
      .for("update")
      .limit(1);
    if (existing && existing.requestHash !== input.requestHash) {
      return { kind: "idempotency_conflict" };
    }
    if (existing?.status === "succeeded" && existing.response) {
      return {
        kind: "cached",
        result: existing.response,
        periodStart: existing.periodStart,
      };
    }
    if (existing?.status === "pending") {
      return { kind: "in_progress" };
    }

    const retryAfterSeconds = await checkBurstLimit(
      tx,
      input.workspaceId,
      now,
    );
    if (retryAfterSeconds !== null) {
      return { kind: "rate_limited", retryAfterSeconds };
    }

    await tx.insert(generationAttemptsTable).values({
      workspaceId: input.workspaceId,
      requestId: input.requestId,
      createdAt: now,
    });

    let requestId = existing?.id;
    if (existing) {
      await tx
        .update(generationRequestsTable)
        .set({
          periodStart,
          status: "pending",
          response: null,
          updatedAt: now,
        })
        .where(eq(generationRequestsTable.id, existing.id));
    } else {
      const [inserted] = await tx
        .insert(generationRequestsTable)
        .values({
          workspaceId: input.workspaceId,
          requestId: input.requestId,
          requestHash: input.requestHash,
          periodStart,
          status: "pending",
          response: null,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            generationRequestsTable.workspaceId,
            generationRequestsTable.requestId,
          ],
        })
        .returning({ id: generationRequestsTable.id });
      requestId = inserted?.id;
      if (!requestId) {
        throw new Error("Generation idempotency record could not be created");
      }
    }

    await tx
      .insert(usageTable)
      .values({
        workspaceId: input.workspaceId,
        periodStart,
        generationCount: 0,
        reservedCount: 0,
      })
      .onConflictDoNothing({
        target: [usageTable.workspaceId, usageTable.periodStart],
      });

    const [reserved] = await tx
      .update(usageTable)
      .set({
        reservedCount: sql`${usageTable.reservedCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(usageTable.workspaceId, input.workspaceId),
          eq(usageTable.periodStart, periodStart),
          sql`${usageTable.generationCount} + ${usageTable.reservedCount} < ${input.plan.generationLimit}`,
        ),
      )
      .returning({ reservedCount: usageTable.reservedCount });

    if (!reserved) {
      await tx
        .update(generationRequestsTable)
        .set({ status: "failed", response: null, updatedAt: now })
        .where(eq(generationRequestsTable.id, requestId));
      return {
        kind: "quota_exhausted",
        limit: input.plan.generationLimit,
      };
    }

    return { kind: "reserved", periodStart };
  });
}

export async function completeGeneration(input: {
  workspaceId: number;
  requestId: string;
  result: GeneratedDraft;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    await lockWorkspaceGeneration(tx, input.workspaceId);
    const [request] = await tx
      .select()
      .from(generationRequestsTable)
      .where(
        and(
          eq(generationRequestsTable.workspaceId, input.workspaceId),
          eq(generationRequestsTable.requestId, input.requestId),
          eq(generationRequestsTable.status, "pending"),
        ),
      )
      .for("update")
      .limit(1);

    if (!request) return false;

    const [usage] = await tx
      .update(usageTable)
      .set({
        reservedCount: sql`GREATEST(${usageTable.reservedCount} - 1, 0)`,
        generationCount: sql`${usageTable.generationCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(usageTable.workspaceId, input.workspaceId),
          eq(usageTable.periodStart, request.periodStart),
          sql`${usageTable.reservedCount} > 0`,
        ),
      )
      .returning({ generationCount: usageTable.generationCount });
    if (!usage) {
      throw new Error("Generation reservation is missing during completion");
    }

    const [completed] = await tx
      .update(generationRequestsTable)
      .set({
        status: "succeeded",
        response: input.result,
        updatedAt: now,
      })
      .where(
        and(
          eq(generationRequestsTable.id, request.id),
          eq(generationRequestsTable.status, "pending"),
        ),
      )
      .returning({ id: generationRequestsTable.id });

    if (!completed) {
      throw new Error("Generation request changed before completion");
    }
    return true;
  });
}

export async function releaseGeneration(input: {
  workspaceId: number;
  requestId: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();

  await db.transaction(async (tx) => {
    await lockWorkspaceGeneration(tx, input.workspaceId);
    const [request] = await tx
      .select()
      .from(generationRequestsTable)
      .where(
        and(
          eq(generationRequestsTable.workspaceId, input.workspaceId),
          eq(generationRequestsTable.requestId, input.requestId),
          eq(generationRequestsTable.status, "pending"),
        ),
      )
      .for("update")
      .limit(1);

    if (!request) return;

    await tx
      .update(usageTable)
      .set({
        reservedCount: sql`GREATEST(${usageTable.reservedCount} - 1, 0)`,
        updatedAt: now,
      })
      .where(
        and(
          eq(usageTable.workspaceId, input.workspaceId),
          eq(usageTable.periodStart, request.periodStart),
          sql`${usageTable.reservedCount} > 0`,
        ),
      );
    await tx
      .update(generationRequestsTable)
      .set({ status: "failed", response: null, updatedAt: now })
      .where(
        and(
          eq(generationRequestsTable.id, request.id),
          eq(generationRequestsTable.status, "pending"),
        ),
      );
  });
}
