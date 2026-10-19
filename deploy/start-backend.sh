#!/bin/sh
set -eu

# A public container must not fall back to the local unauthenticated API mode.
if [ -z "${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}" ] || \
   [ -z "${SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}}" ]; then
  echo "Configure the Supabase URL and publishable key before starting the backend." >&2
  exit 1
fi
if [ -z "${DODO_PAYMENTS_PRODUCT_ID:-}" ]; then
  echo "Configure DODO_PAYMENTS_PRODUCT_ID before starting the backend." >&2
  exit 1
fi
case "${DODO_PAYMENTS_ENVIRONMENT:-}" in
  test_mode|live_mode) ;;
  *) echo "Set DODO_PAYMENTS_ENVIRONMENT to test_mode or live_mode." >&2; exit 1 ;;
esac

exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
