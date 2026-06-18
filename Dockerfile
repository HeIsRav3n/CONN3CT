# ============================================================
# CONN3CT PNL — Multi-stage Production Dockerfile
# ============================================================

# ── Stage 1: Build ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --frozen-lockfile

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ── Stage 2: Production image ─────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Security: run as non-root user
RUN addgroup -S conn3ct && adduser -S conn3ct -G conn3ct

# Install dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init

# Copy built artifacts from builder
COPY --from=builder --chown=conn3ct:conn3ct /app/node_modules ./node_modules
COPY --from=builder --chown=conn3ct:conn3ct /app/dist ./dist
COPY --from=builder --chown=conn3ct:conn3ct /app/prisma ./prisma

# Create logs directory
RUN mkdir -p logs && chown conn3ct:conn3ct logs

USER conn3ct

EXPOSE 3000 9090

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
