import { and, asc, count, desc, eq, type SQL } from "drizzle-orm";
import {
  brandsTable,
  contentsTable,
  db,
  usageTable,
  workspacesTable,
  type Workspace,
} from "@workspace/db";
import { getPlanForWorkspace } from "./plans";
import { currentPeriodEnd, currentPeriodStart } from "./usage-period";

const SUBSCRIPTION_STATUSES = [
  "free",
  "active",
  "pending",
  "cancelled",
  "expired",
] as const;
export { currentPeriodEnd, currentPeriodStart } from "./usage-period";

export async function findWorkspaceForUser(ownerId: string) {
  const [workspace] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.ownerId, ownerId))
    .limit(1);
  return workspace ?? null;
}

export async function findBrandForWorkspace(
  brandId: number,
  workspaceId: number,
) {
  const [brand] = await db
    .select()
    .from(brandsTable)
    .where(
      and(
        eq(brandsTable.id, brandId),
        eq(brandsTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return brand ?? null;
}

export async function getUsageSummary(
  workspace: Pick<
    Workspace,
    "id" | "plan" | "subscriptionStatus" | "planRenewalAt"
  >,
) {
  const periodStart = currentPeriodStart();
  const plan = getPlanForWorkspace(workspace.plan);
  const [usageRows, brandRows] = await Promise.all([
    db
      .select({ used: usageTable.generationCount })
      .from(usageTable)
      .where(
        and(
          eq(usageTable.workspaceId, workspace.id),
          eq(usageTable.periodStart, periodStart),
        ),
      )
      .limit(1),
    db
      .select({ total: count() })
      .from(brandsTable)
      .where(eq(brandsTable.workspaceId, workspace.id)),
  ]);
  const usage = usageRows[0];
  const used = usage?.used ?? 0;
  const brandCount = brandRows[0]?.total ?? 0;
  const subscriptionStatus = SUBSCRIPTION_STATUSES.includes(
    workspace.subscriptionStatus as (typeof SUBSCRIPTION_STATUSES)[number],
  )
    ? (workspace.subscriptionStatus as (typeof SUBSCRIPTION_STATUSES)[number])
    : plan.id === "free"
      ? "free"
      : "pending";
  return {
    plan: plan.id,
    planName: plan.name,
    subscriptionStatus,
    renewalDate: workspace.planRenewalAt,
    periodStart,
    periodEnd: currentPeriodEnd(),
    limit: plan.generationLimit,
    used,
    remaining: Math.max(0, plan.generationLimit - used),
    brandCount,
    brandLimit: plan.brandLimit,
    canCreateBrand: brandCount < plan.brandLimit,
  };
}

export async function getContentItems(
  workspaceId: number,
  filters: SQL<unknown>[] = [],
  limit?: number,
  scheduleOrder = false,
) {
  const where = and(eq(contentsTable.workspaceId, workspaceId), ...filters);
  const query = db
    .select({
      id: contentsTable.id,
      brandId: contentsTable.brandId,
      brandName: brandsTable.name,
      title: contentsTable.title,
      body: contentsTable.body,
      platform: contentsTable.platform,
      contentType: contentsTable.contentType,
      status: contentsTable.status,
      scheduledAt: contentsTable.scheduledAt,
      tags: contentsTable.tags,
      createdAt: contentsTable.createdAt,
      updatedAt: contentsTable.updatedAt,
    })
    .from(contentsTable)
    .innerJoin(
      brandsTable,
      and(
        eq(contentsTable.brandId, brandsTable.id),
        eq(contentsTable.workspaceId, brandsTable.workspaceId),
      ),
    )
    .where(where)
    .orderBy(
      scheduleOrder
        ? asc(contentsTable.scheduledAt)
        : desc(contentsTable.updatedAt),
    );
  return limit === undefined ? query : query.limit(limit);
}

export async function getContentItem(workspaceId: number, contentId: number) {
  const [item] = await getContentItems(workspaceId, [
    eq(contentsTable.id, contentId),
  ]);
  return item ?? null;
}
