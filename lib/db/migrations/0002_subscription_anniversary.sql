ALTER TABLE "contentflow_workspaces"
  ADD COLUMN IF NOT EXISTS "subscription_started_at" timestamp with time zone;
--> statement-breakpoint

-- Preserve existing subscribers: infer a conservative start date from their
-- known renewal date when possible; otherwise leave NULL for application
-- fallback to workspace creation time. Do not change plans or payment history.
UPDATE "contentflow_workspaces"
SET "subscription_started_at" = "plan_renewal_at" - INTERVAL '30 days'
WHERE "subscription_started_at" IS NULL
  AND "plan" <> 'free'
  AND "plan_renewal_at" IS NOT NULL;
