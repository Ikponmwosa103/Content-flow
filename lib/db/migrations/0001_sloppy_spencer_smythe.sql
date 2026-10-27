CREATE TABLE "contentflow_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"reference" text NOT NULL,
	"plan_id" text NOT NULL,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"authorization_url" text,
	"access_code" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contentflow_payments" ADD CONSTRAINT "contentflow_payments_workspace_id_contentflow_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."contentflow_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contentflow_payments_reference_unique" ON "contentflow_payments" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "contentflow_payments_workspace_created_idx" ON "contentflow_payments" USING btree ("workspace_id","created_at");