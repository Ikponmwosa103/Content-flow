# ContentFlow AI

ContentFlow AI helps a workspace create, organize, schedule, and export branded marketing content, including AI-generated drafts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm run build:production` — production typecheck and build
- `pnpm run start:api` — start the built API server (requires `PORT`)
- `pnpm run db:migrate:production` — apply tracked PostgreSQL migrations
- `pnpm --filter @workspace/api-server run test` — run API unit and database integration tests
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes for development databases only
- Required API runtime configuration: `DATABASE_URL`, `GEMINI_API_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NODE_ENV`, and `PORT`
- Required frontend build configuration: `VITE_CLERK_PUBLISHABLE_KEY`
- For a separate frontend host, set `VITE_API_BASE_URL` and allow its exact origin in the API's `CORS_ALLOWED_ORIGINS`
- `VITE_CLERK_PROXY_URL`, `GEMINI_MODEL`, `LOG_LEVEL`, `BASE_PATH`, `NETLIFY_URL`, and `DEPLOY_PRIME_URL` are optional
- Database integration tests use a separate `CONTENTFLOW_TEST_DATABASE_URL`; never point it at production
- See `DEPLOYMENT.md` and `.env.example` for production, Netlify, migrations, and environment setup

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM API bundle) and Vite (web client)

## Where things live

- `lib/db/src/schema` — PostgreSQL schema
- `lib/api-spec/openapi.yaml` — API contract; generated clients and Zod schemas live under `lib/api-client-react` and `lib/api-zod`
- `artifacts/api-server/src/lib/plans.ts` — single source of truth for plan limits and feature flags
- `artifacts/api-server/src/lib/generation-usage.ts` — generation quota reservations, idempotency, and persistent burst limiting
- `artifacts/api-server/src/routes` — authenticated workspace, brand, content, calendar, dashboard, and usage routes
- `artifacts/contentflow-ai/src` — React client

## Architecture decisions

- New workspaces are always created on Free Forever; paid plan activation and payments are not enabled.
- Generation usage counts successful AI generations in UTC calendar months; pending reservations prevent concurrent requests from overbooking.
- Generation idempotency and burst limits are stored in PostgreSQL so they apply across server processes.
- Idempotency keys are bound to a SHA-256 fingerprint of the validated prompt; reusing a key for changed input returns HTTP 409.
- Content-to-brand ownership is enforced by a composite database foreign key and workspace-scoped joins.
- Brand limits are checked while locking the workspace row to prevent concurrent creates from exceeding the plan cap.
- The Clerk Frontend API proxy runs only in production and requires `CLERK_SECRET_KEY`; its browser proxy URL is configured separately.

## Product

Users can manage brand profiles, generate and edit drafts, organize content in a library and calendar, export existing content, and view plan usage. Paid plans are displayed as coming soon.

## User preferences

No additional project-specific user preferences are recorded.

## Gotchas

- Run API code generation after editing `lib/api-spec/openapi.yaml`.
- Apply tracked migrations with `pnpm run db:migrate:production`; run this as a release step before starting the API.
- `pnpm --filter @workspace/db run push` is for development databases only; do not use it against production.
- Database integration tests are skipped unless `CONTENTFLOW_TEST_DATABASE_URL` points at a separate test database with migrations applied.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
