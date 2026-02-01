# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Generate Prisma client
RUN pnpm --filter @apcd/database db:generate

# Build packages
RUN pnpm --filter @apcd/shared build
RUN pnpm --filter @apcd/api build

# Pre-compile seed files so runner stage doesn't need tsx
# esbuild is a transitive dep not hoisted to root in pnpm — install it explicitly
RUN npm install --no-save esbuild && \
  npx esbuild packages/database/prisma/seed.ts \
    --bundle --platform=node --format=cjs \
    --outfile=packages/database/prisma/seed-compiled.js \
    --external:@prisma/client --external:bcryptjs

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

# Copy built files
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 4000

# Apply schema changes + seed on startup, then start the application
CMD sh -c "echo '=== Applying schema ===' && cd /app/packages/database && npx prisma db push --skip-generate 2>&1 && echo '=== Running seed ===' && node prisma/seed-compiled.js 2>&1 && echo '=== Seed complete ===' || echo '=== Seed FAILED ==='; cd /app && node apps/api/dist/main.js"
