ALTER TABLE "contentflow_payments"
  ADD COLUMN IF NOT EXISTS "customer_email" text;
--> statement-breakpoint
ALTER TABLE "contentflow_payments"
  ADD COLUMN IF NOT EXISTS "paystack_subscription_code" text;
--> statement-breakpoint
ALTER TABLE "contentflow_payments"
  ADD COLUMN IF NOT EXISTS "paystack_email_token" text;
--> statement-breakpoint
ALTER TABLE "contentflow_payments"
  ADD COLUMN IF NOT EXISTS "subscription_cancelled_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contentflow_payments_subscription_code_idx"
  ON "contentflow_payments" ("paystack_subscription_code");
