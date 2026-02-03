#!/bin/sh
set -e

echo "=== Starting APCD Portal API ==="

# Run migrations and seed in the background
(
  echo "=== Running migrations in background ==="
  cd /app/packages/database
  npx prisma db push --skip-generate 2>&1 || echo "Migration warning (may be OK if schema unchanged)"
  echo "=== Running seed ==="
  node prisma/seed-compiled.js 2>&1 || echo "Seed warning (may be OK if already seeded)"
  echo "=== Background tasks complete ==="
) &

# Start the API immediately so healthcheck passes
cd /app
exec node apps/api/dist/main.js
