# MCP Server Deployment Strategy 🛰️

**Scenario:** Separate MCP Server from NestJS Backend  
**Goal:** Deploy MCP as standalone service, connect NestJS to it  
**Team Access:** Multiple developers connecting to shared MCP server

---

## Table of Contents

1. [Architecture Options](#architecture-options)
2. [Recommended Approach](#recommended-approach)
3. [Deployment Setup](#deployment-setup)
4. [Team Connection Guide](#team-connection-guide)
5. [Security & Access Control](#security--access-control)
6. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Architecture Options

### Current Setup (Embedded)

```
┌─────────────────────────────────────┐
│   NestJS Backend (Port 3001)        │
│   ├─ REST API                       │
│   ├─ MCP Client                     │
│   └─ MCP Server (embedded/local)    │
└─────────────────────────────────────┘

Problem: MCP server restarts with every NestJS restart
```

### Option 1: Separate Process (Same Machine) ⭐ RECOMMENDED

```
┌─────────────────────────────────────┐
│         Server Machine              │
│  ┌────────────────────────────┐    │
│  │ NestJS Backend (Port 3001)  │    │
│  │ ├─ REST API                 │    │
│  │ └─ MCP Client ──────┐       │    │
│  └────────────────────┘│       │    │
│                        │       │    │
│  ┌────────────────────▼──────┐ │    │
│  │ MCP Server (Port 3000)    │ │    │
│  │ ├─ STAC Catalog Tools     │ │    │
│  │ ├─ Satellite Processing   │ │    │
│  │ └─ SSE Transport          │ │    │
│  └───────────────────────────┘ │    │
└─────────────────────────────────────┘

Benefits:
✅ Independent deployment
✅ MCP stays running during NestJS updates
✅ Easy to scale later
✅ Simple network setup
```

### Option 2: Separate Service (Railway/Render)

```
┌──────────────────────────┐      ┌──────────────────────────┐
│  NestJS Backend          │      │  MCP Server              │
│  (Railway)               │◄────►│  (Railway/Render)        │
│  Port: 443 (HTTPS)       │      │  Port: 443 (HTTPS)       │
│                          │      │                          │
│  MCP_REMOTE_URL=         │      │  Public endpoint         │
│  https://mcp.railway.app │      │  /health, /sse           │
└──────────────────────────┘      └──────────────────────────┘

Benefits:
✅ Fully independent scaling
✅ Geographic distribution
✅ Better resource isolation
✅ Team can connect from anywhere
```

### Option 3: Docker Compose (Local/Production)

```
docker-compose.yml
├─ nestjs-backend (container)
│  ├─ Port: 3001
│  └─ Connects to: mcp-server:3000
│
└─ mcp-server (container)
   ├─ Port: 3000
   └─ Independent restart/scaling

Benefits:
✅ Easy local development
✅ Production-ready setup
✅ Isolated environments
✅ Simple team setup (docker-compose up)
```

---

## Recommended Approach

**For your scenario (manager wants common backend for team):**

### Phase 1: Separate Process on Same Machine (Quick Win)

**Timeline:** 1-2 hours  
**Complexity:** Low  
**Best for:** Immediate team access, simple setup

### Phase 2: Deploy to Railway as Separate Service

**Timeline:** 2-4 hours  
**Complexity:** Medium  
**Best for:** Production, team remote access, scalability

Let's implement **both phases** below.

---

## Phase 1: Separate Process Setup (Same Machine)

### Step 1: Create MCP Server Standalone Script

Create a new file that runs MCP server independently:

**File:** `start-mcp-server.js` (root directory)

```javascript
#!/usr/bin/env node

/**
 * Standalone MCP Server for Axion Geospatial
 * Runs independently from NestJS backend
 *
 * Usage:
 *   node start-mcp-server.js
 *   npm run mcp:start
 */

const path = require("path");
const { spawn } = require("child_process");

// Configuration
const PORT = process.env.MCP_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const MCP_SERVER_PATH = path.join(__dirname, "dist", "mcp", "mcp-server.js");

console.log("🛰️  Starting Axion MCP Server...");
console.log(`📡 Port: ${PORT}`);
console.log(`🌍 Environment: ${NODE_ENV}`);
console.log(`📦 Server path: ${MCP_SERVER_PATH}`);
console.log("");

// Check if built
const fs = require("fs");
if (!fs.existsSync(MCP_SERVER_PATH)) {
  console.error("❌ MCP server not built. Run: npm run build");
  process.exit(1);
}

// Start MCP server
const mcpProcess = spawn("node", [MCP_SERVER_PATH], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: PORT,
    NODE_ENV: NODE_ENV,
  },
});

mcpProcess.on("error", (error) => {
  console.error("❌ Failed to start MCP server:", error);
  process.exit(1);
});

mcpProcess.on("exit", (code) => {
  if (code !== 0) {
    console.error(`❌ MCP server exited with code ${code}`);
    process.exit(code);
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🔌 Shutting down MCP server...");
  mcpProcess.kill("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🔌 Shutting down MCP server...");
  mcpProcess.kill("SIGTERM");
  process.exit(0);
});

console.log("✅ MCP server started successfully");
console.log(`🔗 Health check: http://localhost:${PORT}/health`);
console.log(`🔗 SSE endpoint: http://localhost:${PORT}/sse`);
console.log("");
console.log("Press Ctrl+C to stop");
```

### Step 2: Add npm Scripts

**File:** `package.json`

```json
{
  "scripts": {
    "build": "nest build",

    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/src/main",

    "mcp:start": "node start-mcp-server.js",
    "mcp:dev": "nodemon --watch src/mcp --exec node start-mcp-server.js",

    "start:all": "concurrently \"npm run mcp:start\" \"npm run start:dev\"",
    "start:all:prod": "concurrently \"npm run mcp:start\" \"npm run start:prod\""
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "nodemon": "^3.0.2"
  }
}
```

### Step 3: Update MCP Server for Standalone Mode

**File:** `src/mcp/mcp-server.ts`

Add health endpoint and standalone server logic:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response } from "express";
import cors from "cors";
import { registerAxionTools } from "./tools/axion_realestate.js";

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const API_KEY = process.env.MCP_API_KEY || "axion_default_key";

const app = express();

// Middleware
app.use(
  cors({
    origin: "*", // Configure this in production
    credentials: true,
  }),
);
app.use(express.json());

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "axion-mcp-server",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    tools: 6,
    environment: NODE_ENV,
  });
});

// API key validation middleware
const validateApiKey = (req: Request, res: Response, next: any) => {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;

  if (NODE_ENV === "production" && apiKey !== API_KEY) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  next();
};

// SSE endpoint for MCP
app.get("/sse", validateApiKey, async (req: Request, res: Response) => {
  console.log("📡 New MCP client connection");

  const server = new Server(
    {
      name: "axion-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register all tools
  registerAxionTools(server);

  const transport = new SSEServerTransport("/message", res);
  await server.connect(transport);

  console.log(`✅ MCP session established: ${transport.sessionId}`);

  // Handle client disconnect
  req.on("close", () => {
    console.log("🔌 MCP client disconnected");
  });
});

// Message endpoint for MCP
app.post("/message", validateApiKey, async (req: Request, res: Response) => {
  // Handle MCP messages
  res.json({ received: true });
});

// Start server
app.listen(PORT, () => {
  console.log("\n🛰️  Axion MCP Server Started");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📡 Port:        ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`🔗 Health:      http://localhost:${PORT}/health`);
  console.log(`🔗 SSE:         http://localhost:${PORT}/sse`);
  console.log(`🔑 API Key:     ${NODE_ENV === "production" ? "***" : API_KEY}`);
  console.log(`📦 Tools:       6 available`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🔌 Shutting down MCP server...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🔌 Shutting down MCP server...");
  process.exit(0);
});
```

### Step 4: Update NestJS to Connect to Standalone MCP

**File:** `.env`

```env
# MCP Configuration
MCP_MODE=remote
MCP_REMOTE_URL=http://localhost:3000
MCP_API_KEY=axion_6C1D_634DDAEAA324235F

# For production (separate deployment)
# MCP_REMOTE_URL=https://axion-mcp.railway.app
```

### Step 5: Create Startup Scripts

**File:** `start-all.sh` (Linux/Mac)

```bash
#!/bin/bash

echo "🚀 Starting Axion Backend Services"
echo ""

# Build first
echo "📦 Building application..."
npm run build

# Start MCP server in background
echo "🛰️  Starting MCP server..."
npm run mcp:start &
MCP_PID=$!

# Wait for MCP to be ready
sleep 3

# Check MCP health
echo "🔍 Checking MCP server health..."
curl -s http://localhost:3000/health || {
  echo "❌ MCP server failed to start"
  kill $MCP_PID
  exit 1
}

echo "✅ MCP server ready"
echo ""

# Start NestJS
echo "🚀 Starting NestJS backend..."
npm run start:prod &
NEST_PID=$!

# Wait for NestJS to be ready
sleep 5

# Check NestJS health
echo "🔍 Checking NestJS health..."
curl -s http://localhost:3001/api/geospatial/health || {
  echo "❌ NestJS backend failed to start"
  kill $MCP_PID $NEST_PID
  exit 1
}

echo ""
echo "✅ All services started successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🛰️  MCP Server:     http://localhost:3000"
echo "🚀 NestJS Backend: http://localhost:3001"
echo "📚 API Docs:       http://localhost:3001/api/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "kill $MCP_PID $NEST_PID; exit 0" SIGINT SIGTERM

wait
```

**File:** `start-all.bat` (Windows)

```batch
@echo off
echo 🚀 Starting Axion Backend Services
echo.

echo 📦 Building application...
call npm run build

echo.
echo 🛰️  Starting MCP server...
start /B npm run mcp:start

echo Waiting for MCP server to start...
timeout /t 3 /nobreak > nul

echo.
echo 🔍 Checking MCP server health...
curl -s http://localhost:3000/health
if errorlevel 1 (
  echo ❌ MCP server failed to start
  exit /b 1
)

echo ✅ MCP server ready
echo.

echo 🚀 Starting NestJS backend...
start /B npm run start:prod

echo Waiting for NestJS to start...
timeout /t 5 /nobreak > nul

echo.
echo 🔍 Checking NestJS health...
curl -s http://localhost:3001/api/geospatial/health
if errorlevel 1 (
  echo ❌ NestJS backend failed to start
  exit /b 1
)

echo.
echo ✅ All services started successfully!
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 🛰️  MCP Server:     http://localhost:3000
echo 🚀 NestJS Backend: http://localhost:3001
echo 📚 API Docs:       http://localhost:3001/api/docs
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo Press Ctrl+C to stop services
pause
```

Make executable:

```bash
chmod +x start-all.sh
```

### Step 6: Install Required Dependencies

```bash
npm install concurrently nodemon --save-dev
npm install express cors @types/express @types/cors --save
```

### Step 7: Test Standalone Setup

```bash
# Terminal 1: Start MCP server
npm run mcp:start

# Terminal 2: Start NestJS
npm run start:dev

# Or use combined script:
npm run start:all
```

Verify:

```bash
# Test MCP health
curl http://localhost:3000/health

# Test NestJS health
curl http://localhost:3001/api/geospatial/health

# Test full flow
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: axion-dev-key-abc123" \
  -d '{"query":"Show NDVI for Iowa farmland"}'
```

---

## Phase 2: Deploy MCP Server to Railway (Separate Service)

### Step 1: Create MCP Server Package

Create a separate directory for MCP deployment:

**File:** `mcp-server/package.json`

```json
{
  "name": "axion-mcp-server",
  "version": "1.0.0",
  "description": "Axion MCP Server - Satellite Imagery Tools",
  "main": "dist/mcp-server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/mcp-server.js",
    "dev": "nodemon --watch src --exec ts-node src/mcp-server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.2",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.7"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "typescript": "^5.3.3",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**File:** `mcp-server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 2: Copy MCP Files

```bash
# Create directory structure
mkdir -p mcp-server/src
mkdir -p mcp-server/src/lib
mkdir -p mcp-server/src/tools

# Copy files
cp src/mcp/mcp-server.ts mcp-server/src/
cp src/mcp/lib/* mcp-server/src/lib/
cp src/mcp/tools/* mcp-server/src/tools/
cp .env.example mcp-server/.env.example
```

### Step 3: Create Railway Configuration

**File:** `mcp-server/railway.json`

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**File:** `mcp-server/Procfile`

```
web: npm start
```

### Step 4: Environment Variables for Railway

Create these environment variables in Railway:

```env
# Required
PORT=3000
NODE_ENV=production
MCP_API_KEY=your-secure-api-key-here

# Optional (for tool access)
STAC_API_URL=https://earth-search.aws.element84.com/v1
```

### Step 5: Deploy to Railway

```bash
# Initialize Railway in mcp-server directory
cd mcp-server
railway init

# Deploy
railway up

# Get the URL
railway domain

# Example output: axion-mcp-production.up.railway.app
```

### Step 6: Update NestJS to Use Production MCP

**File:** `axion-backend/.env.production`

```env
# Production MCP URL (from Railway)
MCP_MODE=remote
MCP_REMOTE_URL=https://axion-mcp-production.up.railway.app
MCP_API_KEY=your-secure-api-key-here

# Other production settings
NODE_ENV=production
DATABASE_URL=postgresql://...
```

### Step 7: Test Production Setup

```bash
# Test MCP health
curl https://axion-mcp-production.up.railway.app/health

# Test from NestJS
curl -X POST https://your-nestjs-app.railway.app/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"query":"Show NDVI for Iowa farmland"}'
```

---

## Team Connection Guide

### For Team Members (Local Development)

**Step 1: Clone & Install**

```bash
# Clone main backend
git clone https://github.com/Gauravr08/Axion_backend.git
cd Axion_backend

# Install dependencies
npm install
```

**Step 2: Configure Environment**

Create `.env` file:

```env
# Connect to shared MCP server (production)
MCP_MODE=remote
MCP_REMOTE_URL=https://axion-mcp-production.up.railway.app
MCP_API_KEY=shared-team-api-key

# Or connect to local MCP (if running locally)
# MCP_REMOTE_URL=http://localhost:3000

# OpenRouter (each developer should have their own key)
OPENROUTER_API_KEY=sk-or-v1-your-personal-key

# Database (shared dev database)
DATABASE_URL=postgresql://dev-db-url

# Local server
PORT=3001
NODE_ENV=development
```

**Step 3: Start NestJS Only**

```bash
# MCP server is already running on Railway
# Just start your NestJS backend
npm run start:dev
```

**Step 4: Test Connection**

```bash
# Check if connected to shared MCP
curl http://localhost:3001/api/geospatial/health

# Should see:
# {
#   "mcpConnected": true,
#   "mcpMode": "remote"
# }
```

### For Team Members (Full Local Setup)

If developer wants to run MCP locally:

```bash
# Terminal 1: Start local MCP
npm run mcp:start

# Terminal 2: Start NestJS
npm run start:dev

# Or combined:
npm run start:all
```

Update `.env`:

```env
MCP_REMOTE_URL=http://localhost:3000
```

---

## Docker Compose Setup (Recommended for Teams)

### Step 1: Create Docker Files

**File:** `docker-compose.yml` (root directory)

```yaml
version: "3.8"

services:
  # MCP Server
  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    container_name: axion-mcp-server
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
      - MCP_API_KEY=${MCP_API_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    networks:
      - axion-network

  # NestJS Backend
  nestjs-backend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: axion-nestjs-backend
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - NODE_ENV=production
      - MCP_MODE=remote
      - MCP_REMOTE_URL=http://mcp-server:3000
      - MCP_API_KEY=${MCP_API_KEY}
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      mcp-server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/geospatial/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    networks:
      - axion-network

networks:
  axion-network:
    driver: bridge
```

**File:** `mcp-server/Dockerfile`

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["npm", "start"]
```

**File:** `Dockerfile` (NestJS backend - root directory)

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build
RUN npm run build

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/geospatial/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["npm", "run", "start:prod"]
```

### Step 2: Environment File for Docker

**File:** `.env.docker`

```env
# MCP Configuration
MCP_API_KEY=axion_docker_key_secure_123

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Database
DATABASE_URL=postgresql://user:password@host/dbname

# Other configs
NODE_ENV=production
```

### Step 3: Team Usage

```bash
# Start all services
docker-compose --env-file .env.docker up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild after changes
docker-compose up -d --build
```

### Step 4: Test Docker Setup

```bash
# Test MCP
curl http://localhost:3000/health

# Test NestJS
curl http://localhost:3001/api/geospatial/health

# Test full flow
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: axion-dev-key-abc123" \
  -d '{"query":"Show NDVI for Iowa farmland"}'
```

---

## Security & Access Control

### API Key Management

**Create team API keys in database:**

```sql
-- Connect to your database
psql $DATABASE_URL

-- Create team API key
INSERT INTO api_keys (key, name, enabled)
VALUES (
  'axion_team_shared_key_abc123',
  'Team Shared Key',
  true
);

-- Create developer-specific keys
INSERT INTO api_keys (key, name, enabled)
VALUES
  ('axion_dev_john_xyz789', 'John - Dev Key', true),
  ('axion_dev_sarah_def456', 'Sarah - Dev Key', true);
```

### MCP Access Control

**Option 1: Single Shared Key (Simplest)**

```env
# Everyone uses same key
MCP_API_KEY=axion_team_shared_key
```

**Option 2: Per-Developer Keys (Recommended)**

Modify `mcp-server.ts`:

```typescript
const VALID_API_KEYS = [
  "axion_dev_john_xyz789",
  "axion_dev_sarah_def456",
  "axion_prod_backend_abc123",
];

const validateApiKey = (req: Request, res: Response, next: any) => {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;

  if (!VALID_API_KEYS.includes(apiKey as string)) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  console.log(`✅ Authenticated: ${apiKey}`);
  next();
};
```

### Rate Limiting for MCP

Install rate limiter:

```bash
cd mcp-server
npm install express-rate-limit
```

Add to `mcp-server.ts`:

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  message: "Too many requests from this IP, please try again later",
});

app.use("/sse", limiter);
```

---

## Monitoring & Maintenance

### Health Monitoring

**Setup uptime monitoring:**

1. **UptimeRobot** (Free)
   - Monitor: https://axion-mcp-production.up.railway.app/health
   - Interval: 5 minutes
   - Alert: Email/Slack if down

2. **Better Uptime** (Free tier)
   - Same as above
   - More detailed reporting

### Logging

Add structured logging to MCP server:

```typescript
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

if (NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  );
}

// Usage
logger.info("MCP session established", { sessionId, timestamp });
logger.error("Tool execution failed", { tool, error, timestamp });
```

### Metrics Endpoint

Add to `mcp-server.ts`:

```typescript
let stats = {
  totalConnections: 0,
  activeConnections: 0,
  totalRequests: 0,
  errors: 0,
  startTime: new Date(),
};

app.get("/metrics", (req: Request, res: Response) => {
  const uptime = Date.now() - stats.startTime.getTime();

  res.json({
    service: "axion-mcp-server",
    uptime: Math.floor(uptime / 1000), // seconds
    stats: {
      totalConnections: stats.totalConnections,
      activeConnections: stats.activeConnections,
      totalRequests: stats.totalRequests,
      errors: stats.errors,
      errorRate:
        stats.totalRequests > 0
          ? ((stats.errors / stats.totalRequests) * 100).toFixed(2) + "%"
          : "0%",
    },
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});
```

---

## Team Documentation

### Create Team README

**File:** `TEAM-SETUP.md`

````markdown
# Axion Backend - Team Setup Guide

## Quick Start (Connect to Shared MCP)

1. Clone repository:
   ```bash
   git clone https://github.com/Gauravr08/Axion_backend.git
   cd Axion_backend
   ```
````

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env` file:

   ```env
   # MCP Server (shared - already running)
   MCP_MODE=remote
   MCP_REMOTE_URL=https://axion-mcp-production.up.railway.app
   MCP_API_KEY=ask-team-lead-for-key

   # Your OpenRouter key (get from https://openrouter.ai)
   OPENROUTER_API_KEY=your-personal-key

   # Database (shared dev)
   DATABASE_URL=ask-team-lead-for-url

   # Local server
   PORT=3001
   NODE_ENV=development
   ```

4. Start development:

   ```bash
   npm run start:dev
   ```

5. Test:
   ```bash
   curl http://localhost:3001/api/geospatial/health
   ```

## MCP Server Details

- **Production URL:** https://axion-mcp-production.up.railway.app
- **Health Check:** https://axion-mcp-production.up.railway.app/health
- **Available Tools:** 6 satellite imagery tools
- **Uptime:** Monitored 24/7

## Contact

- MCP Server issues: @your-name
- Backend questions: @team-lead
- API keys: @manager

```

---

## Summary & Recommendations

### ✅ Recommended Setup for Your Team

**Production (Railway):**
```

┌─────────────────────────┐ ┌─────────────────────────┐
│ NestJS Backend │────►│ MCP Server │
│ your-app.railway.app │ │ axion-mcp.railway.app │
└─────────────────────────┘ └─────────────────────────┘

```

**Local Development (Team):**
```

Developer's Machine:
├─ NestJS (local: 3001) ──► Shared MCP (Railway: 3000)
└─ Only runs NestJS, connects to shared MCP ✅

```

### Implementation Timeline

| Phase | Task | Time | Who |
|-------|------|------|-----|
| 1 | Create standalone MCP server | 1h | You |
| 2 | Test local MCP + NestJS | 30m | You |
| 3 | Deploy MCP to Railway | 1h | You |
| 4 | Update NestJS to use production MCP | 30m | You |
| 5 | Create team documentation | 1h | You |
| 6 | Setup monitoring | 30m | You |
| 7 | Share with team | 30m | Team Lead |

**Total: ~5 hours**

### Next Steps

1. **Implement Phase 1** (Separate process)
   - Create `start-mcp-server.js`
   - Update `package.json` scripts
   - Test locally

2. **Deploy to Railway** (Phase 2)
   - Create `mcp-server/` directory
   - Configure Railway
   - Deploy and get URL

3. **Document for Team**
   - Create `TEAM-SETUP.md`
   - Share MCP URL and API key
   - Test with one team member first

4. **Setup Monitoring**
   - Add UptimeRobot
   - Configure Slack alerts
   - Share metrics dashboard

### Benefits for Your Manager

✅ **Single MCP Server:** Team shares one MCP instance
✅ **Cost Efficient:** One server instead of N (per developer)
✅ **Easy Updates:** Update MCP once, everyone benefits
✅ **Better Monitoring:** Centralized metrics and logs
✅ **Scalable:** Can handle multiple NestJS instances
✅ **Independent Deployment:** NestJS and MCP deploy separately

Would you like me to help you implement any of these phases?
```
