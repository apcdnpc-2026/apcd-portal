#!/bin/bash
# APCD Portal - Railway Deployment Script (Bash)
# Run: chmod +x deploy-railway.sh && ./deploy-railway.sh

set -e

echo "========================================"
echo "  APCD Portal - Railway Deployment"
echo "========================================"
echo ""

# Pre-generated secrets (secure, random values)
JWT_SECRET="HLRLKOwXMnqx+2KCdd9zt5m2EqlaG6lj8axpXQcwthg2KZyme2AzwRT6a7R/ZQ0aswpIgbOVJjiq/p4qxYHCww=="
VAPID_PUBLIC_KEY="BAlP3__u2aw6-Jq_epQsKQlmae9BWjZTlfEN6554zFBADDaMo2uzTID3qhRD7bTZiptdfkBJciXYaOoWhv8g5o8"
VAPID_PRIVATE_KEY="t7c6FnGJwRCrV5U6GvW_KAlJENKBmCksz4l_fsEAgbU"

# Step 1: Check if Railway CLI is installed
echo "[1/7] Checking Railway CLI..."
if ! command -v railway &> /dev/null; then
    echo "  Installing Railway CLI..."
    npm install -g @railway/cli
fi
echo "  ✓ Railway CLI ready"

# Step 2: Login to Railway (opens browser for GitHub OAuth)
echo ""
echo "[2/7] Logging in to Railway..."
echo "  A browser window will open for GitHub authentication."
echo "  Please log in with: apcdnpc-2026"
railway login

# Step 3: Initialize project
echo ""
echo "[3/7] Initializing Railway project..."
railway init --name apcd-portal

# Step 4: Add PostgreSQL database
echo ""
echo "[4/7] Adding PostgreSQL database..."
railway add --database postgres

# Step 5: Set environment variables
echo ""
echo "[5/7] Setting environment variables..."
railway variables set NODE_ENV="production"
railway variables set PORT="3001"
railway variables set JWT_SECRET="$JWT_SECRET"
railway variables set JWT_EXPIRES_IN="1d"
railway variables set VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY"
railway variables set VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY"
railway variables set VAPID_SUBJECT="mailto:apcdnpc@gmail.com"
echo "  ✓ Environment variables configured"

# Step 6: Deploy
echo ""
echo "[6/7] Deploying to Railway..."
echo "  This may take 3-5 minutes..."
railway up --detach

# Step 7: Get deployment URL
echo ""
echo "[7/7] Getting deployment URL..."
sleep 5
DEPLOY_URL=$(railway domain 2>/dev/null || echo "https://apcd-portal.up.railway.app")

echo ""
echo "========================================"
echo "  ✅ DEPLOYMENT COMPLETE!"
echo "========================================"
echo ""
echo "Your APCD Portal is deploying at:"
echo "  $DEPLOY_URL"
echo ""
echo "Next steps:"
echo "  1. Wait for build to complete (check: railway logs)"
echo "  2. Run migrations: railway run pnpm prisma migrate deploy"
echo "  3. Verify health: curl $DEPLOY_URL/api/health"
echo ""
echo "Dashboard: https://railway.app/dashboard"
echo ""
