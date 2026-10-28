
import { randomUUID } from "node:crypto";

type DatabaseModule = typeof import("@workspace/db");

export async function loadTestDatabase(): Promise<DatabaseModule | null> {
  const testDatabaseUrl = process.env.CONTENTFLOW_TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    return null;
  }

  if (
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL === testDatabaseUrl
  ) {
    throw new Error(
      "CONTENTFLOW_TEST_DATABASE_URL must point to a separate test database",
    );
  }

  process.env.DATABASE_URL = testDatabaseUrl;

  return import("@workspace/db");
}

export async function createTestWorkspace(
  database: DatabaseModule,
  plan: string,
) {
  const ownerId = `contentflow-test-${randomUUID()}`;

  const [workspace] = await database.db
    .insert(database.workspacesTable)
    .values({
      ownerId,
      name: "ContentFlow test workspace",
      plan,
      subscriptionStatus: plan === "free" ? "free" : "pending",
      planRenewalAt: null,
    })
    .returning({ id: database.workspacesTable.id });

  return {
    id: workspace.id,
    ownerId,

    async cleanup() {
      const { eq } = await import("@workspace/db");

      await database.db
        .delete(database.workspacesTable)
        .where(eq(database.workspacesTable.ownerId, ownerId));
    },
  };
}
