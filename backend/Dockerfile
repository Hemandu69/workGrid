# ==============================================================================
# Stage 1: Build stage
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# The repository has one npm-workspaces lockfile at its root. Build with the
# repository root as the Docker context and install only this workspace.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json

RUN npm ci --workspace=backend

COPY backend/prisma ./backend/prisma/

# Copy source code and build
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src/

RUN npm run build --workspace=backend

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

# Copy package definitions and install only the backend's production dependencies
# from the repository's pinned workspace lockfile.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json

RUN npm ci --omit=dev --workspace=backend

# Copy built application from builder stage
COPY --from=builder --chown=fastify:nodejs /app/backend/dist ./dist
# Prisma CLI is a development dependency. Reuse the generated client and
# platform engine from the build stage rather than downloading a CLI at runtime.
COPY --from=builder --chown=fastify:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Switch to non-root user
USER fastify

EXPOSE 4000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health/live || exit 1

CMD ["node", "dist/server.js"]
