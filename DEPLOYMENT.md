# Production deployment

ContentFlow is a pnpm monorepo with a separately deployable API and Netlify
frontend. Deploy the API to a Node.js host and the static frontend to Netlify.
The API must use a PostgreSQL database; do not use `drizzle-kit push` against
production.

## Build and release commands

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build:production
pnpm run db:migrate:production
pnpm run start:api
```

Run the migration command as a release step against the same `DATABASE_URL`
used by the API, before switching traffic to the new server. The migration is
tracked by Drizzle and uses idempotent table/index creation so it can also
initialize an empty database or adopt a database previously initialized with
the matching development schema. Back up production data before schema
changes. Use `pnpm run db:check-migrations` to check migration ordering.

The API start command expects the host to provide `PORT`. It listens on that
port and fails at startup in production if Clerk or Gemini credentials are
missing. The API exposes `GET /api/healthz` for a basic process health check.

## Netlify frontend

`netlify.toml` runs `scripts/build-netlify.sh` from the monorepo root, publishes
`artifacts/contentflow-ai/dist/public`, and configures SPA route fallback.
The script fails early unless the Clerk publishable key and HTTPS API origin
are set.
Set these Netlify environment variables before building:

- `VITE_CLERK_PUBLISHABLE_KEY` — the Clerk publishable key for this application.
- `VITE_API_BASE_URL` — the API origin only, such as `https://api.example.com`;
  do not append `/api`, a path, or a trailing endpoint.
- `VITE_CLERK_PROXY_URL` — optional full URL to the API's
  `/api/__clerk` endpoint when Clerk Frontend API proxying is enabled.

When the frontend and API are on separate origins, the frontend sends a Clerk
session bearer token to the API. Add the exact Netlify site origin to the API's
`CORS_ALLOWED_ORIGINS`, for example `https://contentflow.netlify.app`. Separate
multiple origins with commas. Add production and any intended deploy-preview
origins explicitly; do not use `*`. The API also recognizes `NETLIFY_URL` and
`DEPLOY_PRIME_URL` if the host environment provides them. Requests without an
`Origin` header are still supported for server-to-server health checks.

## Environment variables

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | API and migration release step | Yes | PostgreSQL connection string |
| `CLERK_PUBLISHABLE_KEY` | API | Yes in production | Clerk publishable key used for server auth middleware |
| `CLERK_SECRET_KEY` | API | Yes in production | Clerk server credential and optional Clerk proxy |
| `GEMINI_API_KEY` | API | Yes in production | Server-side Gemini API credential; never expose as a `VITE_` variable |
| `PORT` | API | Yes | HTTP listen port assigned by the hosting platform |
| `NODE_ENV` | API | Yes | Set to `production` for deployed API processes |
| `VITE_CLERK_PUBLISHABLE_KEY` | Netlify build | Yes | Public Clerk key embedded in the frontend |
| `VITE_API_BASE_URL` | Netlify build | For a separate API origin | API origin; unset only when frontend and API share an origin |
| `CORS_ALLOWED_ORIGINS` | API | For cross-origin browser access | Comma-separated exact frontend origins |
| `GEMINI_MODEL` | API | No | Gemini model name; defaults to `gemini-2.5-flash` |
| `AI_PROVIDER` | API | No | Defaults to Gemini; `mock` is restricted to development/test |
| `VITE_CLERK_PROXY_URL` | Netlify build | No | Full Clerk proxy URL when using Clerk proxying |
| `NETLIFY_URL` | API | No | Optional Netlify production URL added to the CORS allowlist |
| `DEPLOY_PRIME_URL` | API | No | Optional Netlify deploy URL added to the CORS allowlist |
| `BASE_PATH` | Frontend build | No | Vite base path; Netlify config sets `/` |
| `LOG_LEVEL` | API | No | Pino log level; defaults to `info` |
| `CONTENTFLOW_TEST_DATABASE_URL` | Test process | No | Separate disposable PostgreSQL DB for integration tests; never production |

The root `.env.example` lists the variable names without credential values. Keep
real keys and database URLs in the hosting provider's environment/secrets
settings, not in source control.
