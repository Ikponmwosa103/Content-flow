import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";

type AuthResolver = (req: Request) => { userId: string | null | undefined };

export function createRequireAuth(
  resolveAuth: AuthResolver = (req) => getAuth(req),
): RequestHandler {
  return (req, res, next): void => {
    const { userId } = resolveAuth(req);
    if (typeof userId !== "string" || userId.trim().length === 0) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    res.locals.userId = userId;
    next();
  };
}

export const requireAuth = createRequireAuth();

export function getAuthenticatedUserId(res: {
  locals: Record<string, unknown>;
}): string {
  const userId = res.locals.userId;
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new Error("Authenticated user identity is missing");
  }
  return userId;
}
