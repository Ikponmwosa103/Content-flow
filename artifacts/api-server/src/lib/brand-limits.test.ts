import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PLAN_OPTIONS } from "./plans";
import { createTestWorkspace, loadTestDatabase } from "./test-database";

const database = await loadTestDatabase();
const { createBrandWithinPlanLimit } = database
  ? await import("./brand-limits")
  : { createBrandWithinPlanLimit: null };

after(async () => {
  if (database) await database.pool.end();
});

function brandInput(name: string) {
  return {
    name,
    industry: "Test",
    website: null,
    brandVoice: "Clear",
    targetAudience: "Test users",
    contentPillars: [],
  };
}

test(
  "server-side brand caps match every configured plan",
  { skip: !database },
  async () => {
    for (const plan of PLAN_OPTIONS) {
      const workspace = await createTestWorkspace(database!, plan.id);
      try {
        for (let index = 0; index < plan.brandLimit; index += 1) {
          const result = await createBrandWithinPlanLimit!(
            workspace.id,
            brandInput(`${plan.id}-${index}`),
          );
          assert.equal(result.kind, "created");
        }
        const overLimit = await createBrandWithinPlanLimit!(
          workspace.id,
          brandInput(`${plan.id}-over-limit`),
        );
        assert.deepEqual(overLimit, {
          kind: "limit_reached",
          brandLimit: plan.brandLimit,
          planName: plan.name,
        });
      } finally {
        await workspace.cleanup();
      }
    }
  },
);

test(
  "concurrent brand creation cannot bypass the plan cap",
  { skip: !database },
  async () => {
    const workspace = await createTestWorkspace(database!, "starter");
    try {
      for (let index = 0; index < 2; index += 1) {
        assert.equal(
          (
            await createBrandWithinPlanLimit!(
              workspace.id,
              brandInput(`starter-existing-${index}`),
            )
          ).kind,
          "created",
        );
      }
      const results = await Promise.all([
        createBrandWithinPlanLimit!(
          workspace.id,
          brandInput("starter-race-a"),
        ),
        createBrandWithinPlanLimit!(
          workspace.id,
          brandInput("starter-race-b"),
        ),
      ]);
      assert.equal(results.filter((result) => result.kind === "created").length, 1);
      assert.equal(
        results.filter((result) => result.kind === "limit_reached").length,
        1,
      );
    } finally {
      await workspace.cleanup();
    }
  },
);
