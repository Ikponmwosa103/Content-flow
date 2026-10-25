import assert from "node:assert/strict";
import test from "node:test";
import { currentPeriodEnd, currentPeriodStart } from "./usage-period";

test("usage period is based on the UTC calendar month", () => {
  const lateInMonth = new Date("2026-10-31T23:59:59.000Z");
  assert.equal(currentPeriodStart(lateInMonth), "2026-10-01");
  assert.equal(currentPeriodEnd(lateInMonth), "2026-11-01");
});

test("UTC period end rolls across year boundaries and leap years", () => {
  assert.equal(
    currentPeriodEnd(new Date("2026-12-31T23:59:59.000Z")),
    "2027-01-01",
  );
  assert.equal(
    currentPeriodEnd(new Date("2028-02-29T12:00:00.000Z")),
    "2028-03-01",
  );
});

test("offset timestamps are assigned to their UTC month", () => {
  const beforeUtcMonthEnd = new Date("2026-11-01T00:30:00+02:00");
  assert.equal(currentPeriodStart(beforeUtcMonthEnd), "2026-10-01");
  assert.equal(currentPeriodEnd(beforeUtcMonthEnd), "2026-11-01");
});
