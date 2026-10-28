import assert from "node:assert/strict";
import test from "node:test";
import { currentPeriodEnd, currentPeriodStart, monthlyAnniversary } from "./usage-period";

test("period follows the registration/subscription anniversary", () => {
  const anchor = new Date("2026-10-27T09:15:00.000Z");
  const now = new Date("2026-11-03T12:00:00.000Z");
  assert.equal(currentPeriodStart(anchor, now), "2026-10-27");
  assert.equal(currentPeriodEnd(anchor, now), "2026-11-27");
});

test("period boundaries roll across years and leap years", () => {
  const anchor = new Date("2026-12-31T00:00:00.000Z");
  assert.equal(currentPeriodEnd(anchor, new Date("2026-12-31T12:00:00.000Z")), "2027-01-31");
  assert.equal(monthlyAnniversary(new Date("2028-01-31T12:00:00.000Z"), 1).toISOString(), "2028-02-29T12:00:00.000Z");
  assert.equal(monthlyAnniversary(new Date("2028-01-31T12:00:00.000Z"), 2).toISOString(), "2028-03-31T12:00:00.000Z");
});

test("period switches on the anniversary timestamp and uses UTC", () => {
  const anchor = new Date("2026-10-27T18:30:00.000Z");
  assert.equal(currentPeriodStart(anchor, new Date("2026-11-27T18:29:59.999Z")), "2026-10-27");
  assert.equal(currentPeriodStart(anchor, new Date("2026-11-27T18:30:00.000Z")), "2026-11-27");
});
