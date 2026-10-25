import { count, eq } from "drizzle-orm";
import { brandsTable, db, workspacesTable } from "@workspace/db";
import type { InsertBrand } from "@workspace/db";
import { getPlanForWorkspace } from "./plans";

export type BrandCreationResult =
  | { kind: "created"; brand: typeof brandsTable.$inferSelect }
  | { kind: "workspace_missing" }
  | { kind: "limit_reached"; brandLimit: number; planName: string };

export async function createBrandWithinPlanLimit(
  workspaceId: number,
  values: Omit<InsertBrand, "workspaceId">,
): Promise<BrandCreationResult> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, workspaceId))
      .for("update")
      .limit(1);
    if (!workspace) return { kind: "workspace_missing" };

    const [brandCount] = await tx
      .select({ total: count() })
      .from(brandsTable)
      .where(eq(brandsTable.workspaceId, workspace.id));
    const plan = getPlanForWorkspace(workspace.plan);
    if ((brandCount?.total ?? 0) >= plan.brandLimit) {
      return {
        kind: "limit_reached",
        brandLimit: plan.brandLimit,
        planName: plan.name,
      };
    }

    const [brand] = await tx
      .insert(brandsTable)
      .values({
        ...values,
        workspaceId: workspace.id,
      })
      .returning();
    return { kind: "created", brand };
  });
}
