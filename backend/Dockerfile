# ==============================================================================
# Stage 1: Build stage
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy package definition and install all dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci

# Copy source code and build
COPY tsconfig.json ./
COPY src ./src/

RUN npm run build

# ==============================================================================
# Stage 2: Production runtime stage
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl curl

# Create non-root system user
RUN addgroup -g 1001 -S nodejs && adduser -S fastify -u 1001

# Set production environment
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Copy package definitions and install production-only dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci --omit=dev && npx prisma generate

# Copy built application from builder stage
COPY --from=builder --chown=fastify:nodejs /app/dist ./dist

# Switch to non-root user
USER fastify

EXPOSE 4000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health/live || exit 1

CMD ["node", "dist/server.js"]
