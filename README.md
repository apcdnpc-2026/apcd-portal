# APCD OEM Empanelment Portal

Air Pollution Control Devices (APCD) OEM Empanelment Portal developed by National Productivity Council (NPC) for Central Pollution Control Board (CPCB).

## Overview

This portal facilitates the empanelment of Original Equipment Manufacturers (OEMs) of Air Pollution Control Devices for industrial units in Delhi-NCR region. The system handles the complete workflow from application submission to certificate issuance.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui
- **Backend**: NestJS, Node.js 20
- **Database**: PostgreSQL 15 with Prisma ORM
- **Storage**: MinIO (S3-compatible)
- **Cache**: Redis 7
- **Auth**: JWT with refresh tokens
- **Monorepo**: Turborepo with pnpm

## Project Structure

```
apcd-portal/
├── apps/
│   ├── api/                 # NestJS backend
│   │   └── src/
│   │       ├── modules/     # Feature modules
│   │       ├── infrastructure/
│   │       └── common/      # Guards, decorators, filters
│   └── web/                 # Next.js frontend
│       └── src/
│           ├── app/         # App Router pages
│           ├── components/  # React components
│           └── lib/         # Utilities
├── packages/
│   ├── database/           # Prisma schema & migrations
│   └── shared/             # Shared types, constants, validators
└── docker-compose.yml      # Development environment
```

## Features

### User Roles
- **OEM**: Application submission, document upload, payment, certificate management
- **Officer**: Application verification, query management, payment verification
- **Committee Member**: 8-criteria evaluation of applications
- **Field Verifier**: On-site factory verification
- **Admin**: User management, configuration, reports

### Key Capabilities
- Multi-step application form with 26 fields
- 26 document types with geo-tagged photo validation
- Razorpay + NEFT/RTGS payment support
- 8-criteria committee evaluation (100 marks, 60 passing)
- QR-coded empanelment certificates
- 15% discount for MSE/Startup/Local Suppliers

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 8+
- Docker & Docker Compose

### Development Setup

1. Clone and install dependencies:
```bash
git clone <repository-url>
cd apcd-portal
pnpm install
```

2. Start development services:
```bash
docker-compose up -d postgres minio redis
```

3. Setup database:
```bash
pnpm --filter @apcd/database db:push
pnpm --filter @apcd/database db:seed
```

4. Start development servers:
```bash
pnpm dev
```

Access:
- Frontend: http://localhost:3000
- API: http://localhost:4000
- API Docs: http://localhost:4000/api/docs
- MinIO Console: http://localhost:9001

### Docker Development

Run everything in Docker:
```bash
docker-compose up --build
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Database
DATABASE_URL=postgresql://apcd:password@localhost:5432/apcd_portal

# JWT
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minio_admin
MINIO_SECRET_KEY=minio_password
MINIO_BUCKET=apcd-attachments

# Razorpay (optional)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Portal URL (for QR codes)
PORTAL_URL=http://localhost:3000
```

## API Documentation

API documentation is available via Swagger UI at `/api/docs` when running the API server.

### Key Endpoints

- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - OEM registration
- `GET /api/v1/applications` - List applications
- `POST /api/v1/applications` - Create application
- `GET /api/v1/certificates/verify/:number` - Public certificate verification

## Fee Structure

| Fee Type | Amount | GST (18%) | Total |
|----------|--------|-----------|-------|
| Application Fee | ₹25,000 | ₹4,500 | ₹29,500 |
| Empanelment Fee (per APCD) | ₹65,000 | ₹11,700 | ₹76,700 |
| Field Verification | ₹57,000 | ₹10,260 | ₹67,260 |
| Renewal | ₹35,000 | ₹6,300 | ₹41,300 |

*15% discount applicable for MSE, DPIIT Startups, and Class-I/II Local Suppliers*

## Scripts

```bash
# Development
pnpm dev              # Start all apps in dev mode
pnpm build            # Build all packages and apps
pnpm lint             # Run ESLint
pnpm type-check       # TypeScript type checking

# Database
pnpm --filter @apcd/database db:push      # Push schema changes
pnpm --filter @apcd/database db:generate  # Generate Prisma client
pnpm --filter @apcd/database db:seed      # Seed database
pnpm --filter @apcd/database db:studio    # Open Prisma Studio
```

## Security

See [SECURITY.md](SECURITY.md) for security policies and guidelines.

## License

Proprietary - National Productivity Council

## Support

For technical support, contact: support@npc.gov.in
