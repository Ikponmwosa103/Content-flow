import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateBrandBody,
  CreateBrandResponse,
  CreateWorkspaceBody,
  CreateWorkspaceResponse,
  DeleteBrandParams,
  GetWorkspaceResponse,
  ListBrandsResponse,
  UpdateWorkspaceBody,
  UpdateWorkspaceResponse,
  UpdateBrandBody,
  UpdateBrandParams,
  UpdateBrandResponse,
} from "@workspace/api-zod";
import { brandsTable, db, workspacesTable } from "@workspace/db";
import {
  getAuthenticatedUserId,
  requireAuth,
} from "../middlewares/requireAuth";
import { findWorkspaceForUser } from "../lib/contentflow";
import { createBrandWithinPlanLimit } from "../lib/brand-limits";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/workspace", async (_req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Create your workspace to get started" });
    return;
  }
  res.json(GetWorkspaceResponse.parse(workspace));
});

router.patch("/workspace", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const parsed = UpdateWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide a workspace name to update" });
    return;
  }

  const name = parsed.data.name?.trim();
  if (name !== undefined && !name) {
    res.status(400).json({ error: "Workspace name cannot be empty" });
    return;
  }

  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const [updated] = await db
    .update(workspacesTable)
    .set({ name, updatedAt: new Date() })
    .where(
      and(
        eq(workspacesTable.id, workspace.id),
        eq(workspacesTable.ownerId, userId),
      ),
    )
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }
  res.json(UpdateWorkspaceResponse.parse(updated));
});

router.post("/workspace", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const parsed = CreateWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [workspace] = await db
    .insert(workspacesTable)
    .values({
      ownerId: userId,
      name: parsed.data.name.trim(),
      plan: "free",
      subscriptionStatus: "free",
      planRenewalAt: null,
    })
    .onConflictDoNothing({ target: workspacesTable.ownerId })
    .returning();
  if (!workspace) {
    res.status(409).json({ error: "A workspace already exists" });
    return;
  }
  res.status(201).json(CreateWorkspaceResponse.parse(workspace));
});

router.get("/brands", async (_req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const brands = await db
    .select()
    .from(brandsTable)
    .where(eq(brandsTable.workspaceId, workspace.id))
    .orderBy(asc(brandsTable.name));
  res.json(ListBrandsResponse.parse(brands));
});

router.post("/brands", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const parsed = CreateBrandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await createBrandWithinPlanLimit(workspace.id, {
    ...parsed.data,
    name: parsed.data.name.trim(),
    website: parsed.data.website ?? null,
    contentPillars: parsed.data.contentPillars ?? [],
  });

  if (result.kind === "workspace_missing") {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }
  if (result.kind === "limit_reached") {
    res.status(409).json({
      error: `Brand limit reached for your ${result.planName} plan (${result.brandLimit} maximum).`,
    });
    return;
  }
  res.status(201).json(CreateBrandResponse.parse(result.brand));
});

router.patch("/brands/:id", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const params = UpdateBrandParams.safeParse(req.params);
  const parsed = UpdateBrandBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({
      error: params.success
        ? parsed.success
          ? "Provide at least one field to update"
          : parsed.error.message
        : params.error.message,
    });
    return;
  }

  const [brand] = await db
    .update(brandsTable)
    .set({
      ...parsed.data,
      name: parsed.data.name?.trim(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(brandsTable.id, params.data.id),
        eq(brandsTable.workspaceId, workspace.id),
      ),
    )
    .returning();
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }
  res.json(UpdateBrandResponse.parse(brand));
});

router.delete("/brands/:id", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const params = DeleteBrandParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(brandsTable)
    .where(
      and(
        eq(brandsTable.id, params.data.id),
        eq(brandsTable.workspaceId, workspace.id),
      ),
    )
    .returning({ id: brandsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
