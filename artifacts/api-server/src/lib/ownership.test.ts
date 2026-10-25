import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createTestWorkspace, loadTestDatabase } from "./test-database";

const database = await loadTestDatabase();
const contentflow = database ? await import("./contentflow") : null;

after(async () => {
  if (database) await database.pool.end();
});

test(
  "brand, content, and workspace lookups do not cross workspace ownership",
  { skip: !database },
  async () => {
    const owner = await createTestWorkspace(database!, "free");
    const other = await createTestWorkspace(database!, "free");
    try {
      const [brand] = await database!.db
        .insert(database!.brandsTable)
        .values({
          workspaceId: other.id,
          name: "Other workspace brand",
          industry: "Test",
          website: null,
          brandVoice: "Direct",
          targetAudience: "Test audience",
          contentPillars: [],
        })
        .returning({ id: database!.brandsTable.id });
      const [content] = await database!.db
        .insert(database!.contentsTable)
        .values({
          workspaceId: other.id,
          brandId: brand.id,
          title: "Private content",
          body: "Only the other workspace should find this.",
          platform: "linkedin",
          contentType: "post",
          status: "draft",
          tags: [],
        })
        .returning({ id: database!.contentsTable.id });

      assert.equal(
        await contentflow!.findBrandForWorkspace(brand.id, owner.id),
        null,
      );
      assert.equal(
        await contentflow!.getContentItem(owner.id, content.id),
        null,
      );
      assert.equal(
        (await contentflow!.findWorkspaceForUser(other.ownerId))?.id,
        other.id,
      );
      assert.notEqual(
        (await contentflow!.findWorkspaceForUser(owner.ownerId))?.id,
        other.id,
      );
      await assert.rejects(
        database!.db.insert(database!.contentsTable).values({
          workspaceId: owner.id,
          brandId: brand.id,
          title: "Cross-workspace content",
          body: "This relationship must be rejected by the database.",
          platform: "linkedin",
          contentType: "post",
          status: "draft",
          tags: [],
        }),
      );
    } finally {
      await Promise.all([owner.cleanup(), other.cleanup()]);
    }
  },
);
