import assert from "node:assert/strict";
import test from "node:test";
import { getPlanForWorkspace, PLAN_OPTIONS } from "./plans";

test("central plan configuration contains the requested limits and feature levels", () => {
  assert.deepEqual(
    PLAN_OPTIONS.map(({ id, monthlyPriceNgn, generationLimit, brandLimit }) => ({
      id,
      monthlyPriceNgn,
      generationLimit,
      brandLimit,
    })),
    [
      {
        id: "free",
        monthlyPriceNgn: 0,
        generationLimit: 10,
        brandLimit: 1,
      },
      {
        id: "starter",
        monthlyPriceNgn: 3000,
        generationLimit: 100,
        brandLimit: 3,
      },
      {
        id: "pro",
        monthlyPriceNgn: 7000,
        generationLimit: 300,
        brandLimit: 10,
      },
    ],
  );
  assert.deepEqual(PLAN_OPTIONS[0].featureFlags, {
    calendar: "basic",
    export: "basic",
  });
  assert.deepEqual(PLAN_OPTIONS[1].featureFlags, {
    calendar: "full",
    export: "full",
  });
  assert.deepEqual(PLAN_OPTIONS[2].featureFlags, {
    calendar: "full",
    export: "full",
  });
  assert.equal(PLAN_OPTIONS[0].availableForUpgrade, false);
  assert.equal(PLAN_OPTIONS[1].availableForUpgrade, false);
  assert.equal(PLAN_OPTIONS[2].availableForUpgrade, false);
});

test("unknown persisted plan IDs fail closed to Free Forever", () => {
  assert.equal(getPlanForWorkspace("unexpected-plan").id, "free");
  assert.equal(getPlanForWorkspace(undefined).id, "free");
});
