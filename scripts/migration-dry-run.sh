#!/usr/bin/env bash
set -euo pipefail

echo "Running Drizzle migration dry-run check..."

BEFORE_STATUS=$(git status --porcelain drizzle/)

# Run drizzle-kit generate
pnpm exec drizzle-kit generate

AFTER_STATUS=$(git status --porcelain drizzle/)

if [ "$BEFORE_STATUS" != "$AFTER_STATUS" ]; then
  echo "Error: Database schema drift detected! Running 'drizzle-kit generate' produced new migration files or schema diffs:"
  git status --porcelain drizzle/
  echo "Please run 'pnpm exec drizzle-kit generate' locally and commit the resulting migration files."
  # Clean up newly generated untracked files
  git checkout -- drizzle/ 2>/dev/null || true
  git clean -fd drizzle/ 2>/dev/null || true
  exit 1
fi

if [ -n "${CI:-}" ] && [ -n "$AFTER_STATUS" ]; then
  echo "Error: Uncommitted changes in drizzle/ detected in CI:"
  echo "$AFTER_STATUS"
  exit 1
fi

echo "Zero drift detected. Schema matches migrations perfectly."
