# APCD Portal - Deployment Guide

## 🚀 Quick Deploy (Railway - Recommended)

### Option 1: One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/apcd-portal)

### Option 2: CLI Deploy

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add PostgreSQL
railway add --database postgres

# Set environment variables
railway variables set JWT_SECRET="$(openssl rand -base64 64)"
railway variables set VAPID_PUBLIC_KEY="your-vapid-public-key"
railway variables set VAPID_PRIVATE_KEY="your-vapid-private-key"

# Deploy
railway up

# Open in browser
railway open
```

**Estimated time: 3 minutes**

---

## 🐳 Docker Compose (Self-Hosted)

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- 10GB disk space

### Deploy

```bash
# Clone repository
git clone https://github.com/your-org/apcd-portal.git
cd apcd-portal

# Copy environment template
cp .env.production.example .env

# Edit environment variables
nano .env

# Start services
docker compose -f docker-compose.prod.yml up -d

# Run migrations
docker compose exec api pnpm prisma migrate deploy

# Check health
curl http://localhost/api/health
```

### Services Started

| Service  | Port       | Description      |
| -------- | ---------- | ---------------- |
| nginx    | 80, 443    | Reverse proxy    |
| api      | 3001       | NestJS backend   |
| web      | 3000       | Next.js frontend |
| postgres | 5432       | Database         |
| minio    | 9000, 9001 | Object storage   |
| redis    | 6379       | Session cache    |

---

## ☁️ Cloud Deployments

### Render

```bash
# Create render.yaml in root
# Push to GitHub
# Connect repo in Render dashboard
# Services auto-deploy
```

### AWS ECS

```bash
# Build image
docker build -t apcd-portal .

# Push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
docker tag apcd-portal:latest $ECR_URL/apcd-portal:latest
docker push $ECR_URL/apcd-portal:latest

# Deploy via ECS task definition
aws ecs update-service --cluster apcd --service portal --force-new-deployment
```

### DigitalOcean App Platform

1. Fork repository
2. Create App in DO dashboard
3. Connect GitHub repo
4. Add PostgreSQL database
5. Set environment variables
6. Deploy

---

## 🔐 Environment Variables

### Required

| Variable            | Description           | Example                               |
| ------------------- | --------------------- | ------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET`        | Auth signing key      | 64+ character string                  |
| `VAPID_PUBLIC_KEY`  | Push notification key | From `web-push generate-vapid-keys`   |
| `VAPID_PRIVATE_KEY` | Push notification key | From `web-push generate-vapid-keys`   |

### Optional

| Variable         | Default    | Description    |
| ---------------- | ---------- | -------------- |
| `PORT`           | 3001       | API port       |
| `NODE_ENV`       | production | Environment    |
| `MINIO_ENDPOINT` | localhost  | Object storage |
| `SMTP_HOST`      | -          | Email server   |

### Generate Secrets

```bash
# JWT Secret
openssl rand -base64 64

# VAPID Keys
npx web-push generate-vapid-keys
```

---

## 📊 Health Checks

### Endpoints

- `GET /api/health` - API health
- `GET /` - Web app (Next.js)

### Expected Response

```json
{
  "status": "ok",
  "timestamp": "2026-02-03T12:00:00.000Z",
  "version": "1.0.0"
}
```

---

## 🧪 Verify Deployment

```bash
# 1. Health check
curl https://your-domain.com/api/health

# 2. Database connection
curl https://your-domain.com/api/apcd-types

# 3. Auth flow
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# 4. Load test (optional)
npx artillery run load-test.yml --target https://your-domain.com
```

---

## 🔧 Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker compose ps postgres

# Check connection string
docker compose exec api env | grep DATABASE_URL

# Run migrations manually
docker compose exec api pnpm prisma migrate deploy
```

### File Upload Failed

```bash
# Check MinIO is running
docker compose ps minio

# Verify bucket exists
docker compose exec minio mc ls local/apcd-documents
```

### Service Won't Start

```bash
# Check logs
docker compose logs api --tail 100

# Restart service
docker compose restart api
```

---

## 📈 Monitoring

### Recommended Stack

- **Metrics**: Prometheus + Grafana
- **Logs**: Loki or CloudWatch
- **APM**: New Relic or Datadog
- **Uptime**: UptimeRobot or Pingdom

### Key Metrics

- Response time p95 < 500ms
- Error rate < 1%
- Database connections < 80%
- Memory usage < 80%

---

## 🔄 Updates

```bash
# Pull latest
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Run any new migrations
docker compose exec api pnpm prisma migrate deploy
```

---

## 📞 Support

- **Issues**: https://github.com/your-org/apcd-portal/issues
- **Docs**: https://docs.apcd-portal.gov.in
- **Email**: support@apcd.gov.in

---

**Version**: 1.0.0
**Last Updated**: 2026-02-03
**Status**: Production Ready ✅
