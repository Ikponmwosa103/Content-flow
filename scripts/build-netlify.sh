#!/bin/sh
set -eu

if [ -z "${VITE_CLERK_PUBLISHABLE_KEY:-}" ]; then
  echo "Missing required Netlify build variable: VITE_CLERK_PUBLISHABLE_KEY" >&2
  exit 1
fi

if [ -z "${VITE_API_BASE_URL:-}" ]; then
  echo "Missing required Netlify build variable: VITE_API_BASE_URL" >&2
  exit 1
fi

case "$VITE_API_BASE_URL" in
  https://*) ;;
  *)
    echo "VITE_API_BASE_URL must be an HTTPS API origin in production" >&2
    exit 1
    ;;
esac

pnpm run typecheck
pnpm --filter @workspace/contentflow-ai run build
