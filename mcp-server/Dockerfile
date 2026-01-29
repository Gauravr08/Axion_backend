# ========================================
# STAGE 1: Dependencies
# ========================================
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# ========================================
# STAGE 2: Build
# ========================================
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# ========================================
# STAGE 3: Production Dependencies
# ========================================
FROM node:20-alpine AS production-dependencies

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ========================================
# STAGE 4: Production Runtime
# ========================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpserver -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=production-dependencies --chown=mcpserver:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=build --chown=mcpserver:nodejs /app/dist ./dist
COPY --from=build --chown=mcpserver:nodejs /app/package*.json ./

# Switch to non-root user
USER mcpserver

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "dist/server.js"]
