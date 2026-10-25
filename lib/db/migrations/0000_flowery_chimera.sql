CREATE TABLE IF NOT EXISTS "contentflow_workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"subscription_status" text DEFAULT 'free' NOT NULL,
	"plan_renewal_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contentflow_workspaces_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contentflow_brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"name" text NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"website" text,
	"brand_voice" text DEFAULT '' NOT NULL,
	"target_audience" text DEFAULT '' NOT NULL,
	"content_pillars" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contentflow_contents" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"brand_id" integer NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"platform" text NOT NULL,
	"content_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contentflow_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"generation_count" integer DEFAULT 0 NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contentflow_generation_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contentflow_generation_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text,
	"period_start" text NOT NULL,
	"status" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contentflow_generation_requests" ADD COLUMN IF NOT EXISTS "request_hash" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contentflow_brands_id_workspace_unique" ON "contentflow_brands" USING btree ("id","workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contentflow_usage_workspace_period_unique" ON "contentflow_usage" USING btree ("workspace_id","period_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contentflow_generation_attempts_workspace_created_idx" ON "contentflow_generation_attempts" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contentflow_generation_requests_workspace_key_unique" ON "contentflow_generation_requests" USING btree ("workspace_id","request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contentflow_generation_requests_created_idx" ON "contentflow_generation_requests" USING btree ("created_at");
--> statement-breakpoint
DO $migration$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contentflow_brands_workspace_id_contentflow_workspaces_id_fk' AND conrelid = 'contentflow_brands'::regclass) THEN
		ALTER TABLE "contentflow_brands" ADD CONSTRAINT "contentflow_brands_workspace_id_contentflow_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."contentflow_workspaces"("id") ON DELETE cascade;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contentflow_contents_workspace_id_contentflow_workspaces_id_fk' AND conrelid = 'contentflow_contents'::regclass) THEN
		ALTER TABLE "contentflow_contents" ADD CONSTRAINT "contentflow_contents_workspace_id_contentflow_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."contentflow_workspaces"("id") ON DELETE cascade;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contentflow_usage_workspace_id_contentflow_workspaces_id_fk' AND conrelid = 'contentflow_usage'::regclass) THEN
		ALTER TABLE "contentflow_usage" ADD CONSTRAINT "contentflow_usage_workspace_id_contentflow_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."contentflow_workspaces"("id") ON DELETE cascade;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contentflow_generation_attempts_workspace_id_contentflow_worksp' AND conrelid = 'contentflow_generation_attempts'::regclass) THEN
		ALTER TABLE "contentflow_generation_attempts" ADD CONSTRAINT "contentflow_generation_attempts_workspace_id_contentflow_worksp" FOREIGN KEY ("workspace_id") REFERENCES "public"."contentflow_workspaces"("id") ON DELETE cascade;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contentflow_generation_requests_workspace_id_contentflow_worksp' AND conrelid = 'contentflow_generation_requests'::regclass) THEN
		ALTER TABLE "contentflow_generation_requests" ADD CONSTRAINT "contentflow_generation_requests_workspace_id_contentflow_worksp" FOREIGN KEY ("workspace_id") REFERENCES "public"."contentflow_workspaces"("id") ON DELETE cascade;
	END IF;
END
$migration$;
--> statement-breakpoint
ALTER TABLE "contentflow_contents" DROP CONSTRAINT IF EXISTS "contentflow_contents_brand_id_contentflow_brands_id_fk";
--> statement-breakpoint
DO $migration$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'contentflow_contents_brand_workspace_fk'
		  AND conrelid = 'contentflow_contents'::regclass
	) THEN
		ALTER TABLE "contentflow_contents"
			ADD CONSTRAINT "contentflow_contents_brand_workspace_fk"
			FOREIGN KEY ("brand_id", "workspace_id")
			REFERENCES "public"."contentflow_brands"("id", "workspace_id")
			ON DELETE cascade NOT VALID;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM "contentflow_contents" AS content
		LEFT JOIN "contentflow_brands" AS brand
		  ON brand."id" = content."brand_id"
		 AND brand."workspace_id" = content."workspace_id"
		WHERE brand."id" IS NULL
	) THEN
		ALTER TABLE "contentflow_contents"
			VALIDATE CONSTRAINT "contentflow_contents_brand_workspace_fk";
	END IF;
END
$migration$;
