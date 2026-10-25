import { and, count, eq, gte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetDashboardResponse,
  GetUsageResponse,
} from "@workspace/api-zod";
import { brandsTable, contentsTable, db } from "@workspace/db";
import {
  getAuthenticatedUserId,
  requireAuth,
} from "../middlewares/requireAuth";
import {
  findWorkspaceForUser,
  getContentItems,
  getUsageSummary,
} from "../lib/contentflow";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/usage", async (_req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }
  res.json(GetUsageResponse.parse(await getUsageSummary(workspace)));
});

router.get("/dashboard", async (_req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const [brandCount, contentCount, draftCount, scheduledCount, usage, recent, upcoming] =
    await Promise.all([
      db
        .select({ total: count() })
        .from(brandsTable)
        .where(eq(brandsTable.workspaceId, workspace.id)),
      db
        .select({ total: count() })
        .from(contentsTable)
        .where(eq(contentsTable.workspaceId, workspace.id)),
      db
        .select({ total: count() })
        .from(contentsTable)
        .where(
          and(
            eq(contentsTable.workspaceId, workspace.id),
            eq(contentsTable.status, "draft"),
          ),
        ),
      db
        .select({ total: count() })
        .from(contentsTable)
        .where(
          and(
            eq(contentsTable.workspaceId, workspace.id),
            eq(contentsTable.status, "scheduled"),
          ),
        ),
      getUsageSummary(workspace),
      getContentItems(workspace.id, [], 5),
      getContentItems(
        workspace.id,
        [
          eq(contentsTable.status, "scheduled"),
          gte(contentsTable.scheduledAt, new Date()),
        ],
        5,
        true,
      ),
    ]);

  const summary = {
    workspace,
    brandCount: brandCount[0]?.total ?? 0,
    contentCount: contentCount[0]?.total ?? 0,
    draftCount: draftCount[0]?.total ?? 0,
    scheduledCount: scheduledCount[0]?.total ?? 0,
    usage,
    recentContent: recent,
    upcomingContent: upcoming,
  };
  res.json(GetDashboardResponse.parse(summary));
});

export default router;
