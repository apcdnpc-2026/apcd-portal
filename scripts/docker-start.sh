#!/bin/sh
set -e

echo "=== Starting APCD Portal API ==="
echo "PORT=${PORT:-3001}"
echo "NODE_ENV=${NODE_ENV:-production}"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "WARNING: DATABASE_URL not set - skipping migrations"
else
  echo "DATABASE_URL is configured"
  # Run migrations and seed in the background
  (
    sleep 5  # Wait for app to start first
    echo "=== Running migrations in background ==="
    cd /app/packages/database
    npx prisma db push --skip-generate 2>&1 || echo "Migration warning (may be OK if schema unchanged)"
    echo "=== Running seed ==="
    node prisma/seed-compiled.js 2>&1 || echo "Seed warning (may be OK if already seeded)"
    echo "=== Background tasks complete ==="
  ) &
fi

# Start the API immediately so healthcheck passes
cd /app
echo "=== Starting Node.js server ==="
exec node apps/api/dist/main.js
