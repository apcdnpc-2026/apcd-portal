# APCD Portal - Railway Deployment Script (PowerShell)
# Run: .\deploy-railway.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  APCD Portal - Railway Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Pre-generated secrets (secure, random values)
$JWT_SECRET = "HLRLKOwXMnqx+2KCdd9zt5m2EqlaG6lj8axpXQcwthg2KZyme2AzwRT6a7R/ZQ0aswpIgbOVJjiq/p4qxYHCww=="
$VAPID_PUBLIC_KEY = "BAlP3__u2aw6-Jq_epQsKQlmae9BWjZTlfEN6554zFBADDaMo2uzTID3qhRD7bTZiptdfkBJciXYaOoWhv8g5o8"
$VAPID_PRIVATE_KEY = "t7c6FnGJwRCrV5U6GvW_KAlJENKBmCksz4l_fsEAgbU"

# Step 1: Check if Railway CLI is installed
Write-Host "[1/7] Checking Railway CLI..." -ForegroundColor Yellow
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railwayInstalled) {
    Write-Host "  Installing Railway CLI..." -ForegroundColor Gray
    npm install -g @railway/cli
}
Write-Host "  Railway CLI ready" -ForegroundColor Green

# Step 2: Login to Railway (opens browser for GitHub OAuth)
Write-Host ""
Write-Host "[2/7] Logging in to Railway..." -ForegroundColor Yellow
Write-Host "  A browser window will open for GitHub authentication." -ForegroundColor Gray
Write-Host "  Please log in with: apcdnpc-2026" -ForegroundColor Gray
railway login

# Step 3: Initialize project
Write-Host ""
Write-Host "[3/7] Initializing Railway project..." -ForegroundColor Yellow
railway init --name apcd-portal

# Step 4: Add PostgreSQL database
Write-Host ""
Write-Host "[4/7] Adding PostgreSQL database..." -ForegroundColor Yellow
railway add --database postgres

# Step 5: Set environment variables
Write-Host ""
Write-Host "[5/7] Setting environment variables..." -ForegroundColor Yellow
railway variables set NODE_ENV="production"
railway variables set PORT="3001"
railway variables set JWT_SECRET="$JWT_SECRET"
railway variables set JWT_EXPIRES_IN="1d"
railway variables set VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY"
railway variables set VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY"
railway variables set VAPID_SUBJECT="mailto:apcdnpc@gmail.com"
Write-Host "  Environment variables configured" -ForegroundColor Green

# Step 6: Deploy
Write-Host ""
Write-Host "[6/7] Deploying to Railway..." -ForegroundColor Yellow
Write-Host "  This may take 3-5 minutes..." -ForegroundColor Gray
railway up --detach

# Step 7: Get deployment URL
Write-Host ""
Write-Host "[7/7] Getting deployment URL..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
$deployUrl = railway domain

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your APCD Portal is deploying at:" -ForegroundColor White
Write-Host "  $deployUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Wait for build to complete (check: railway logs)" -ForegroundColor Gray
Write-Host "  2. Run migrations: railway run pnpm prisma migrate deploy" -ForegroundColor Gray
Write-Host "  3. Verify health: curl $deployUrl/api/health" -ForegroundColor Gray
Write-Host ""
Write-Host "Dashboard: https://railway.app/dashboard" -ForegroundColor Gray
Write-Host ""
