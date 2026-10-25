import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createRequireAuth } from "../middlewares/requireAuth";

function runMiddleware(userId: string | null | undefined) {
  const res = {
    locals: {} as Record<string, unknown>,
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;
  createRequireAuth(() => ({ userId }))(
    {} as Request,
    res as unknown as Response,
    () => {
      nextCalled = true;
    },
  );
  return { res, nextCalled };
}

test("unauthenticated requests stop with HTTP 401", () => {
  for (const userId of [null, undefined, ""]) {
    const { res, nextCalled } = runMiddleware(userId);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "Authentication required" });
    assert.equal(nextCalled, false);
  }
});

test("authenticated requests receive only the resolver's verified user ID", () => {
  const { res, nextCalled } = runMiddleware("user_verified_by_clerk");
  assert.equal(res.statusCode, 200);
  assert.equal(res.locals.userId, "user_verified_by_clerk");
  assert.equal(nextCalled, true);
});
