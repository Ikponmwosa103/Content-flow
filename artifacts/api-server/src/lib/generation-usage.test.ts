
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { PLAN_OPTIONS } from "./plans";
import { createTestWorkspace, loadTestDatabase } from "./test-database";

const database = await loadTestDatabase();
const dbOperators = database
  ? await import("@workspace/db")
  : null;
const generationUsage = database
  ? await import("./generation-usage")
  : null;

after(async () => {
  if (database) await database.pool.end();
});


test(
  "monthly rollover isolates usage in UTC calendar months",
  { skip: !database },
  async () => {
    const workspace = await createTestWorkspace(database!, "free");
    try {
      const first = await generationUsage!.reserveGeneration({
        workspaceId: workspace.id,
        requestId: randomUUID(),
        requestHash: "a".repeat(64),
        plan: PLAN_OPTIONS[0],
        now: new Date("2026-10-31T23:59:00.000Z"),
      });
      const second = await generationUsage!.reserveGeneration({
        workspaceId: workspace.id,
        requestId: randomUUID(),
        requestHash: "b".repeat(64),
        plan: PLAN_OPTIONS[0],
        now: new Date("2026-11-01T00:01:00.000Z"),
      });
      assert.deepEqual(first, { kind: "reserved", periodStart: "2026-10-01" });
      assert.deepEqual(second, { kind: "reserved", periodStart: "2026-11-01" });
    } finally {
      await workspace.cleanup();
    }
  },
);

test(
  "a full monthly quota rejects another reservation",
  { skip: !database },
  async () => {
    const workspace = await createTestWorkspace(database!, "free");
    try {
      await database!.db.insert(database!.usageTable).values({
        workspaceId: workspace.id,
        periodStart: "2026-10-01",
        generationCount: 10,
        reservedCount: 0,
      });
      const result = await generationUsage!.reserveGeneration({
        workspaceId: workspace.id,
        requestId: randomUUID(),
        requestHash: "c".repeat(64),
        plan: PLAN_OPTIONS[0],
        now: new Date("2026-10-25T12:00:00.000Z"),
      });
      assert.deepEqual(result, { kind: "quota_exhausted", limit: 10 });
    } finally {
      await workspace.cleanup();
    }
  },
);

test(
  "concurrent reservations cannot exceed the monthly quota",
  { skip: !database },
  async () => {
    const workspace = await createTestWorkspace(database!, "free");
    try {
      await database!.db.insert(database!.usageTable).values({
        workspaceId: workspace.id,
        periodStart: "2026-10-01",
        generationCount: 9,
        reservedCount: 0,
      });
      const now = new Date("2026-10-25T12:00:00.000Z");
      const results = await Promise.all([
        generationUsage!.reserveGeneration({
          workspaceId: workspace.id,
          requestId: randomUUID(),
          requestHash: "d".repeat(64),
          plan: PLAN_OPTIONS[0],
          now,
        }),
        generationUsage!.reserveGeneration({
          workspaceId: workspace.id,
          requestId: randomUUID(),
          requestHash: "e".repeat(64),
          plan: PLAN_OPTIONS[0],
          now,
        }),
      ]);
      assert.equal(results.filter((result) => result.kind === "reserved").length, 1);
      assert.equal(
        results.filter((result) => result.kind === "quota_exhausted").length,
        1,
      );
    } finally {
      await workspace.cleanup();
    }
  },
);

test(
  "duplicate request IDs return an in-progress response and cache one success",
  { skip: !database },
  async () => {
    const workspace = await createTestWorkspace(database!, "free");
    const requestId = randomUUID();
    const now = new Date("2026-10-25T12:00:00.000Z");
    const draft = { title: "A title", body: "A body" };
    const pendingRequestIds: string[] = [];
    try {
      const first = await generationUsage!.reserveGeneration({
        workspaceId: workspace.id,
        requestId,
        requestHash: "f".repeat(64),
        plan: PLAN_OPTIONS[0],
        now,
      });
      const duplicateWhilePending = await generationUsage!.reserveGeneration({
        workspaceId: workspace.id,
        requestId,
        requestHash: "f".repeat(64),
        plan: PLAN_OPTIONS[0],
        now,
      });
      assert.equal(first.kind, "reserved");
      assert.deepEqual(duplicateWhilePending, { kind: "in_progress" });
      assert.deepEqual(
        await generationUsage!.reserveGeneration({
          workspaceId: workspace.id,
          requestId,
          requestHash: "x".repeat(64),
          plan: PLAN_OPTIONS[0],
          now,
        }),
        { kind: "idempotency_conflict" },
      );

      assert.equal(
        await generationUsage!.completeGeneration({
          workspaceId: workspace.id,
          requestId,
          result: draft,
          now,
        }),
        true,
      );
      assert.equal(
        await generationUsage!.completeGeneration({
          workspaceId: workspace.id,
          requestId,
          result: draft,
          now,
        }),
        false,
      );

      for (let index = 0; index < 4; index += 1) {
        const pendingRequestId = randomUUID();
        pendingRequestIds.push(pendingRequestId);
        assert.equal(
          (
            await generationUsage!.reserveGeneration({
              workspaceId: workspace.id,
              requestId: pendingRequestId,
              requestHash: "g".repeat(64),
              plan: PLAN_OPTIONS[0],
              now,
            })
          ).kind,
          "reserved",
        );
      }

      const [usage] = await database!.db
        .select()
        .from(database!.usageTable)
        .where(
          dbOperators!.and(
            dbOperators!.eq(database!.usageTable.workspaceId, workspace.id),
            dbOperators!.eq(database!.usageTable.periodStart, "2026-10-01"),
          ),
        );

      assert.equal(usage.generationCount, 1);
      assert.equal(usage.reservedCount, 4);
    } finally {
      for (const pendingRequestId of pendingRequestIds) {
        await generationUsage!.releaseGeneration({
          workspaceId: workspace.id,
          requestId: pendingRequestId,
          now,
        });
      }
      await workspace.cleanup();
    }
  },
);


test(
  "provider failure releases only its reservation without spending usage",
  { skip: !database },
  async () => {
    const workspace = await createTestWorkspace(database!, "free");
    const requestId = randomUUID();
    try {
      const reserved = await generationUsage!.reserveGeneration({
        workspaceId: workspace.id,
        requestId,
        requestHash: "h".repeat(64),
        plan: PLAN_OPTIONS[0],
        now: new Date("2026-10-25T12:00:00.000Z"),
      });
      assert.equal(reserved.kind, "reserved");
      await generationUsage!.releaseGeneration({
        workspaceId: workspace.id,
        requestId,
        now: new Date("2026-10-25T12:00:10.000Z"),
      });
      const retry = await generationUsage!.reserveGeneration({
        workspaceId: workspace.id,
        requestId,
        requestHash: "h".repeat(64),
        plan: PLAN_OPTIONS[0],
        now: new Date("2026-10-25T12:00:20.000Z"),
      });
      assert.equal(retry.kind, "reserved");
      await generationUsage!.releaseGeneration({
        workspaceId: workspace.id,
        requestId,
        now: new Date("2026-10-25T12:00:30.000Z"),
      });

      const [usage] = await database!.db
        .select()
        .from(database!.usageTable)
        .where(
          dbOperators!.and(
            dbOperators!.eq(database!.usageTable.workspaceId, workspace.id),
            dbOperators!.eq(database!.usageTable.periodStart, "2026-10-01"),
          ),
        );

      assert.equal(usage.generationCount, 0);
      assert.equal(usage.reservedCount, 0);
       } finally {
      await workspace.cleanup();
    }
  },
);


test(
  "the shared burst limiter throttles excess requests with a retry delay",
  { skip: !database },
  async () => {
    const workspace = await createTestWorkspace(database!, "free");
    const requestIds: string[] = [];
    try {
      const now = new Date("2026-10-25T12:00:00.000Z");
      const results = [];
      for (let index = 0; index < 6; index += 1) {
        const requestId = randomUUID();
        requestIds.push(requestId);
        results.push(
          await generationUsage!.reserveGeneration({
            workspaceId: workspace.id,
            requestId,
            requestHash: "i".repeat(64),
            plan: PLAN_OPTIONS[0],
            now,
          }),
        );
      }
      assert.equal(results.filter((result) => result.kind === "reserved").length, 5);
      const throttled = results.find((result) => result.kind === "rate_limited");
      assert.equal(throttled?.kind, "rate_limited");
      if (throttled?.kind === "rate_limited") {
        assert.ok(throttled.retryAfterSeconds >= 1);
      }

      for (const requestId of requestIds) {
        await generationUsage!.releaseGeneration({
          workspaceId: workspace.id,
          requestId,
          now,
        });
      }
    } finally {
      await workspace.cleanup();
    }
  },
);
