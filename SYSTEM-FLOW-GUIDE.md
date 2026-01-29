# Axion Backend - System Flow Explanation 🚀

**For:** Team onboarding / Code walkthrough  
**Version:** Day 5 (Caching & Optimization Complete)  
**Date:** January 27, 2026

---

## 📋 Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Request Flow (Step-by-Step)](#request-flow-step-by-step)
3. [File Structure & Responsibilities](#file-structure--responsibilities)
4. [Detailed Flow Diagrams](#detailed-flow-diagrams)
5. [Key Concepts](#key-concepts)
6. [Example Request Walkthrough](#example-request-walkthrough)

---

## High-Level Architecture

```
User Request
    ↓
[ Security Layer ]          ← API Key + Rate Limiting
    ↓
[ Optimization Layer ]      ← Compression + Cache Headers + Helmet
    ↓
[ Cache Layer ]            ← Redis/Memory Cache
    ↓
[ Controller ]             ← Route handling
    ↓
[ Service Layer ]          ← Business logic
    ↓
[ External APIs ]          ← OpenRouter + MCP Server
    ↓
[ Database Layer ]         ← PostgreSQL (Neon)
    ↓
Response (with logging, tracking, caching)
```

---

## Request Flow (Step-by-Step)

### 1. **Entry Point: `main.ts`**

```typescript
Location: src/main.ts
Role: Application bootstrap & middleware setup

What it does:
✅ Initializes Sentry error tracking
✅ Applies Helmet security headers
✅ Enables HTTP compression
✅ Configures CORS
✅ Sets up global validation
✅ Registers Swagger docs
✅ Starts the server on port 3001
```

**Flow:**

```
main.ts
  ├─ initializeSentry()                    → Monitoring setup
  ├─ app.use(helmet())                     → Security headers
  ├─ app.use(compression())                → Response compression
  ├─ app.useGlobalPipes(ValidationPipe)    → Input validation
  ├─ app.enableCors()                      → CORS setup
  └─ app.listen(3001)                      → Server start
```

---

### 2. **App Module: `app.module.ts`**

```typescript
Location: src/app.module.ts
Role: Dependency injection & module orchestration

What it does:
✅ Registers all modules (Database, Cache, Logging, Tasks, Geospatial)
✅ Applies global guards (API Key, Rate Limiting)
✅ Applies global interceptors (Cache-Control headers)
✅ Validates environment variables
```

**Module Hierarchy:**

```
AppModule
  ├─ ConfigModule          → Environment validation (Joi)
  ├─ ThrottlerModule       → Rate limiting (20 req/min default)
  ├─ LoggingModule         → Winston logging
  ├─ DatabaseModule        → Prisma client (Neon DB)
  ├─ CachingModule         → Redis/Memory cache
  ├─ TasksModule           → Scheduled jobs (metrics, cleanup)
  └─ GeospatialModule      → Main API endpoints
```

**Global Providers:**

```
APP_GUARD → ApiKeyGuard              (Security)
APP_GUARD → ThrottlerGuard           (Rate limiting)
APP_INTERCEPTOR → CacheControlInterceptor  (HTTP caching)
```

---

### 3. **Security Layer: Guards**

#### **A. API Key Guard**

```typescript
Location: src/guards/api-key.guard.ts
Role: Authentication via x-api-key header

Flow:
1. Check if route has @Public() decorator → Skip auth
2. Extract x-api-key from request headers
3. Try database validation first (check api_keys table)
4. Fallback to environment variable validation
5. Attach apiKeyId to request for tracking
6. Allow/deny request
```

**Database-First Strategy:**

```
Request with x-api-key
  ↓
Check database (api_keys table)
  ↓ (if DB fails)
Fallback to .env API_KEYS
  ↓
Valid? → Proceed | Invalid? → 401 Unauthorized
```

#### **B. Rate Limiter (Throttler)**

```typescript
Location: @nestjs/throttler (built-in)
Config: src/app.module.ts

Limits:
- Default: 20 requests/min per IP
- /analyze: 10 requests/min (strict)
- /health: No limit (@SkipThrottle)

Response: 429 Too Many Requests (if exceeded)
```

---

### 4. **Controller Layer: `geospatial.controller.ts`**

```typescript
Location: src/geospatial/geospatial.controller.ts
Role: HTTP endpoint definitions & request handling

Endpoints:
┌─────────────────────────────────────────────────────────┐
│ POST   /api/geospatial/analyze    → AI analysis        │
│ GET    /api/geospatial/health     → Health check       │
│ GET    /api/geospatial/analytics  → Usage stats        │
│ GET    /api/geospatial/metrics    → System metrics     │
└─────────────────────────────────────────────────────────┘

Responsibilities:
1. Route requests to services
2. Handle errors gracefully
3. Transform responses
4. Apply rate limiting per endpoint
5. Check cache before expensive operations
```

**Controller Dependencies:**

```typescript
constructor(
  private geospatialService: GeospatialService,  // Main business logic
  private databaseService: DatabaseService,      // DB operations
  private cacheService: CacheService,            // Caching
  private metricsService: MetricsService,        // Health metrics
)
```

---

### 5. **Service Layer: `geospatial.service.ts`**

```typescript
Location: src/geospatial/geospatial.service.ts
Role: Core business logic & AI integration

Responsibilities:
✅ Connect to MCP server (remote/local fallback)
✅ Send queries to OpenRouter AI (with tools)
✅ Execute MCP tools (satellite imagery analysis)
✅ Handle retries & timeouts
✅ Cache results
✅ Track usage in database (fire-and-forget)
```

**Main Method: `analyzeQuery()`**

```typescript
Flow:
1. Generate request ID & start timer
2. Validate MCP connection
3. Check cache for existing result
   ├─ Cache HIT → Return instantly (8ms)
   └─ Cache MISS → Continue to step 4
4. Get MCP tools (STAC catalog tools)
5. Send to OpenRouter with tools
6. If AI wants to use tool:
   ├─ Execute MCP tool (with retry)
   ├─ Send result back to AI
   └─ Get final natural language response
7. Cache the result (fire-and-forget)
8. Track usage in DB (fire-and-forget)
9. Return response
```

**Error Handling:**

```typescript
Custom Errors:
- OpenRouterError     → API authentication/rate limit issues
- McpConnectionError  → MCP server unavailable
- ToolExecutionError  → Satellite tool failed
- TimeoutError        → Request took too long
- RateLimitError      → Too many requests
```

**Timeout Protection:**

```
Analysis timeout: 90 seconds
OpenRouter timeout: 60 seconds
MCP health check: 10 seconds
Tool retry: 2 attempts with exponential backoff
```

---

### 6. **Cache Layer: `cache.service.ts`**

```typescript
Location: src/cache/cache.service.ts
Role: Intelligent caching with Redis/memory fallback

Cache Strategy:
┌────────────────────────────────────────────┐
│ Data Type              │ TTL    │ Reason  │
├────────────────────────────────────────────┤
│ OpenRouter responses   │ 1h     │ Stable  │
│ MCP tool results       │ 30m    │ Changes │
│ Analytics             │ 5m     │ Fresh   │
│ Metrics               │ 1m     │ Current │
│ Health checks         │ 30s    │ Quick   │
└────────────────────────────────────────────┘

Key Methods:
- cacheOpenRouterResponse()  → Save AI response
- getCachedOpenRouterResponse() → Retrieve cached
- cacheAnalytics() → Save analytics
- getCachedAnalytics() → Retrieve analytics
- cacheMetrics() → Save metrics
- getCachedMetrics() → Retrieve metrics
```

**Cache Key Generation:**

```typescript
Method: SHA-256 hash of input parameters
Format: prefix:hash16
Example: "openrouter:abc123def456"

Why? Ensures unique, consistent keys for same input
```

**Fallback Strategy:**

```
Try Redis (Upstash)
  ↓ (connection fails)
Fall back to in-memory cache
  ↓
System continues working ✅
```

---

### 7. **Database Layer: `database.service.ts`**

```typescript
Location: src/database/database.service.ts
Role: Prisma client wrapper & database operations

Database Models:
┌──────────────────────────────────────────────────┐
│ api_keys        → API key storage & validation   │
│ api_usage       → Request tracking & analytics   │
│ system_metrics  → Hourly health snapshots        │
└──────────────────────────────────────────────────┘

Key Methods:
- getApiKey()        → Validate API key
- trackUsage()       → Log request (fire-and-forget)
- getAnalytics()     → Aggregate usage stats
- seedApiKeys()      → Auto-create demo keys
```

**Prisma 7 Setup:**

```typescript
Uses PostgreSQL adapter:
- @prisma/adapter-pg
- Connection pooling
- SSL mode: require
```

**Database Connection:**

```
Neon DB (PostgreSQL)
├─ Pooled connections
├─ SSL required
├─ Auto-reconnect on failure
└─ Graceful degradation (logs warning, continues)
```

---

### 8. **MCP Integration: `mcp/` folder**

```typescript
Location: src/mcp/
Role: Model Context Protocol - Satellite imagery tools

What is MCP?
A protocol for connecting AI models to external tools/data sources.
In our case: STAC catalog for satellite imagery.

MCP Server Modes:
┌────────────────────────────────────────────────┐
│ Remote Mode (default):                         │
│ - Runs on port 3000                            │
│ - SSE transport (Server-Sent Events)           │
│ - Can be deployed separately                   │
│                                                │
│ Local Mode (fallback):                         │
│ - Spawns child process                         │
│ - Stdio transport                              │
│ - Uses dist/mcp/mcp-server.js                  │
└────────────────────────────────────────────────┘

Available Tools (6):
1. axion_data          → Search STAC catalog
2. axion_system        → Site analysis (NDVI, etc)
3. axion_map           → Generate maps
4. axion_process       → Image processing
5. axion_export        → Export data
6. axion_classification → Land classification
```

**MCP Connection Flow:**

```typescript
1. Check MCP_MODE env variable
2. Try connecting to configured mode
3. If remote fails → Try local fallback
4. If both fail → Service degraded (no tools)
5. List available tools
6. Ready to receive requests
```

---

### 9. **Background Tasks: `tasks/` folder**

#### **A. Data Retention Service**

```typescript
Location: src/tasks/data-retention.service.ts
Schedule: Daily at 2:00 AM
Role: Cleanup old data

What it does:
1. Delete api_usage records > 30 days old
2. Delete system_metrics > 30 days old
3. Log cleanup stats
4. Keep database size manageable
```

#### **B. Metrics Collection Service**

```typescript
Location: src/tasks/metrics.service.ts
Schedule: Every hour
Role: Capture system health snapshots

What it does:
1. Count requests in last hour
2. Calculate error rate
3. Calculate avg response time
4. Sum OpenRouter costs
5. Store in system_metrics table
6. Used for /metrics endpoint
```

---

### 10. **Logging: `logging/` folder**

```typescript
Location: src/logging/
Role: Winston-based structured logging

Log Files:
├─ logs/application-YYYY-MM-DD.log  → All logs
├─ logs/error-YYYY-MM-DD.log        → Errors only
├─ logs/http-YYYY-MM-DD.log         → HTTP requests
├─ logs/exceptions.log               → Uncaught exceptions
└─ logs/rejections.log               → Unhandled promises

Features:
- Daily rotation
- Automatic compression
- Retention: 14-30 days
- JSON formatting for production
- Colorized for development
```

**Log Levels:**

```
error   → Critical issues (DB down, API fails)
warn    → Warnings (cache miss, retry attempt)
info    → General info (server start, connection)
http    → HTTP requests
debug   → Detailed debugging
```

---

### 11. **Monitoring: `monitoring/` folder**

```typescript
Location: src/monitoring/sentry.config.ts
Role: Error tracking & performance monitoring

Features:
- Automatic error capture
- Performance profiling
- Release tracking
- Environment tagging
- Disabled in development (optional)

Setup:
SENTRY_DSN=your-sentry-dsn
SENTRY_DEV_ENABLED=false
```

---

### 12. **Configuration: `config/` folder**

```typescript
Location: src/config/configuration.ts
Role: Environment validation with Joi

Validates:
- PORT (default: 3001)
- NODE_ENV (development/production)
- OPENROUTER_API_KEY (required)
- MCP_MODE (remote/local)
- DATABASE_URL (required)
- UPSTASH_REDIS_URL (optional)
- API_KEYS (comma-separated)
- ALLOWED_ORIGINS (CORS)

Fails fast: App won't start with invalid config ✅
```

---

## File Structure & Responsibilities

```
src/
├── main.ts                          🚀 Application entry point
│
├── app.module.ts                    📦 Root module (dependency injection)
│
├── config/
│   └── configuration.ts             ⚙️  Environment validation (Joi)
│
├── guards/
│   └── api-key.guard.ts             🔒 Authentication (database-first)
│
├── interceptors/
│   └── cache-control.interceptor.ts 📋 HTTP cache headers
│
├── decorators/
│   └── public.decorator.ts          🔓 Skip auth for public endpoints
│
├── errors/
│   └── app-errors.ts                ⚠️  Custom error classes
│
├── cache/
│   ├── cache.module.ts              💾 Cache setup (Redis/memory)
│   └── cache.service.ts             💾 Cache operations
│
├── database/
│   ├── database.module.ts           🗄️  Prisma module
│   └── database.service.ts          🗄️  Database operations
│
├── logging/
│   ├── logging.module.ts            📝 Winston setup
│   └── winston.config.ts            📝 Log configuration
│
├── monitoring/
│   └── sentry.config.ts             📊 Sentry error tracking
│
├── tasks/
│   ├── tasks.module.ts              ⏰ Scheduled jobs module
│   ├── metrics.service.ts           📈 Hourly metrics collection
│   └── data-retention.service.ts    🧹 Daily cleanup (30 days)
│
├── geospatial/
│   ├── geospatial.module.ts         🌍 Main API module
│   ├── geospatial.controller.ts     🌍 REST endpoints
│   ├── geospatial.service.ts        🌍 Business logic + AI
│   └── dto/
│       └── analyze.dto.ts           ✅ Input validation
│
└── mcp/
    ├── mcp-server.ts                🛰️  MCP server (satellite tools)
    ├── lib/
    │   ├── sse-client-transport.ts  🔌 Remote MCP connection
    │   ├── stac-client.ts           📡 STAC catalog client
    │   └── registry.ts              📋 Tool registry
    └── tools/
        └── axion_realestate.ts      🏘️  Real estate analysis tools

prisma/
├── schema.prisma                    📋 Database schema
├── migrations/                      📦 Migration history
└── prisma.config.ts                 ⚙️  Prisma 7 config

logs/                                📝 Auto-generated log files
├── application-YYYY-MM-DD.log
├── error-YYYY-MM-DD.log
└── http-YYYY-MM-DD.log
```

---

## Detailed Flow Diagrams

### Flow 1: Analyze Request (POST /api/geospatial/analyze)

```
User sends request:
POST /api/geospatial/analyze
Headers: x-api-key: axion-dev-key-abc123
Body: { "query": "Show NDVI for Iowa farmland" }

│
├─► [1] main.ts → Middleware Stack
│   ├─ Helmet (security headers)
│   ├─ Compression (gzip)
│   └─ CORS check
│
├─► [2] app.module.ts → Global Guards
│   ├─ ApiKeyGuard
│   │   ├─ Extract x-api-key from header
│   │   ├─ Check database (api_keys table)
│   │   ├─ Fallback to .env if DB fails
│   │   └─ Attach apiKeyId to request
│   │
│   └─ ThrottlerGuard
│       ├─ Check: 10 requests/min for /analyze
│       └─ Allow or 429 Too Many Requests
│
├─► [3] geospatial.controller.ts → Route Handler
│   ├─ @Post('analyze')
│   ├─ Validate body (AnalyzeDto)
│   ├─ Extract IP & User-Agent
│   └─ Call geospatialService.analyzeQuery()
│
├─► [4] geospatial.service.ts → Business Logic
│   ├─ Generate requestId
│   ├─ Start timer
│   ├─ Validate MCP connection
│   │
│   ├─► [5] cache.service.ts → Check Cache
│   │   ├─ Generate cache key (SHA-256 hash)
│   │   ├─ Check Redis/memory
│   │   └─ Return if found (CACHE HIT - 8ms) ⚡
│   │
│   ├─ CACHE MISS → Continue
│   │
│   ├─► [6] MCP Client → Get Tools
│   │   ├─ List available tools (6 tools)
│   │   └─ Convert to OpenRouter format
│   │
│   ├─► [7] OpenRouter API → AI Query
│   │   ├─ POST https://openrouter.ai/api/v1/chat/completions
│   │   ├─ Model: x-ai/grok-4.1-fast
│   │   ├─ Include: query + available tools
│   │   ├─ Timeout: 60 seconds
│   │   ├─ Retry: 3 attempts with backoff
│   │   └─ Response: AI decides to use a tool
│   │
│   ├─► [8] MCP Client → Execute Tool
│   │   ├─ Tool: axion_system (NDVI calculation)
│   │   ├─ Args: { location: "Iowa", type: "agricultural" }
│   │   ├─ Retry: 2 attempts if fails
│   │   └─ Response: { ndvi: 0.72, visualizationUrl: "..." }
│   │
│   ├─► [9] OpenRouter API → Final Response
│   │   ├─ Send tool result back to AI
│   │   └─ Get natural language explanation
│   │
│   ├─► [10] cache.service.ts → Store Result
│   │   ├─ Cache result for 1 hour
│   │   └─ Fire-and-forget (doesn't block)
│   │
│   ├─► [11] database.service.ts → Track Usage
│   │   ├─ Store in api_usage table
│   │   ├─ Fields: query, response time, cost, tokens
│   │   └─ Fire-and-forget (doesn't block)
│   │
│   └─ Return response
│
├─► [12] cache-control.interceptor.ts → Add Headers
│   ├─ Cache-Control: private, max-age=3600
│   └─ ETag: "abc123..." (auto-generated)
│
└─► [13] Response to User
    ├─ Status: 200 OK
    ├─ Headers: Cache-Control, ETag, Content-Encoding: gzip
    ├─ Body (compressed):
    │   {
    │     "success": true,
    │     "response": "The Iowa farmland shows healthy vegetation...",
    │     "data": { "ndvi": 0.72, ... },
    │     "visualizationUrl": "https://titiler.xyz/...",
    │     "mcpMode": "remote",
    │     "fromCache": false
    │   }
    └─ Response time: 3.5 seconds (first time)

Next identical request: 8ms (from cache) ⚡
```

---

### Flow 2: Analytics Request (GET /api/geospatial/analytics?days=7)

```
User sends request:
GET /api/geospatial/analytics?days=7
Headers: x-api-key: axion-dev-key-abc123

│
├─► [1-2] Security Layer (same as Flow 1)
│   ├─ Helmet, Compression, CORS
│   ├─ API Key validation
│   └─ Rate limiting (20 req/min default)
│
├─► [3] geospatial.controller.ts → getAnalytics()
│   ├─ Extract days parameter (default: 7)
│   │
│   ├─► [4] cache.service.ts → Check Cache
│   │   ├─ Key: "analytics:7d"
│   │   ├─ TTL: 5 minutes
│   │   └─ Return if found (CACHE HIT - 5ms) ⚡
│   │
│   ├─ CACHE MISS → Continue
│   │
│   ├─► [5] database.service.ts → getAnalytics(7)
│   │   ├─ Calculate date range (last 7 days)
│   │   ├─ Query api_usage table:
│   │   │   ├─ Count total requests
│   │   │   ├─ Count successful requests
│   │   │   ├─ Count failed requests
│   │   │   ├─ Calculate avg response time
│   │   │   ├─ Sum total cost
│   │   │   └─ Sum total tokens
│   │   │
│   │   └─ Optimized with SELECT clauses (only needed fields)
│   │
│   ├─► [6] cache.service.ts → Store Result
│   │   ├─ Cache for 5 minutes
│   │   └─ Fire-and-forget
│   │
│   └─ Return analytics
│
├─► [7] cache-control.interceptor.ts
│   └─ Cache-Control: private, max-age=300 (5 minutes)
│
└─► [8] Response to User
    ├─ Status: 200 OK
    ├─ Body (compressed):
    │   {
    │     "period": "Last 7 days",
    │     "totalRequests": 1250,
    │     "successfulRequests": 1180,
    │     "failedRequests": 70,
    │     "successRate": "94.40",
    │     "avgResponseTime": 3450,
    │     "totalCost": "0.1234",
    │     "totalTokens": 245000
    │   }
    └─ Response time: 800ms (first time)

Next request within 5 min: 5ms (from cache) ⚡
```

---

### Flow 3: Background Tasks (Scheduled Jobs)

#### Metrics Collection (Every Hour)

```
Schedule: @Cron(CronExpression.EVERY_HOUR)
Service: src/tasks/metrics.service.ts

│
├─► [1] collectSystemMetrics() triggered
│   ├─ Get current time
│   ├─ Calculate time window (last 1 hour)
│   │
│   ├─► [2] database.service.ts → Query Stats
│   │   ├─ Count: total requests (last 1 hour)
│   │   ├─ Count: errors (last 1 hour)
│   │   ├─ Aggregate: avg response time
│   │   ├─ Sum: OpenRouter costs
│   │   └─ Optimized with SELECT clauses
│   │
│   ├─► [3] geospatial.service.ts → MCP Status
│   │   ├─ Check: isMcpConnected()
│   │   └─ Get: getMcpMode()
│   │
│   ├─► [4] database.service.ts → Store Metrics
│   │   ├─ Insert into system_metrics table
│   │   └─ Fields: requestCount, errorCount, avgResponseTime, cost
│   │
│   └─ Log success
```

#### Data Cleanup (Daily at 2 AM)

```
Schedule: @Cron('0 2 * * *')
Service: src/tasks/data-retention.service.ts

│
├─► [1] cleanupOldData() triggered
│   ├─ Get current time
│   ├─ Calculate cutoff (30 days ago)
│   │
│   ├─► [2] database.service.ts → Delete Old Usage
│   │   ├─ DELETE FROM api_usage
│   │   ├─ WHERE createdAt < 30 days ago
│   │   └─ Return count deleted
│   │
│   ├─► [3] database.service.ts → Delete Old Metrics
│   │   ├─ DELETE FROM system_metrics
│   │   ├─ WHERE timestamp < 30 days ago
│   │   └─ Return count deleted
│   │
│   └─ Log cleanup stats
```

---

## Key Concepts

### 1. **Fire-and-Forget Pattern**

Used for non-critical async operations that shouldn't block responses:

```typescript
// Cache write (don't wait)
this.cacheService
  .cacheOpenRouterResponse(query, model, response)
  .catch((error) => this.logger.warn(`Cache failed: ${error.message}`));

// Usage tracking (don't wait)
this.databaseService
  .trackUsage(data)
  .catch((error) => this.logger.warn(`Tracking failed: ${error.message}`));

// Benefit: Response returns immediately, logging happens in background
```

**Why?**

- User gets response faster
- System continues even if cache/DB fails
- Errors are logged but don't propagate

---

### 2. **Graceful Degradation**

System continues working even when components fail:

```typescript
// Redis unavailable? → Use memory cache
if (Redis fails) {
  console.warn("Falling back to in-memory cache");
  return memoryCache;
}

// Database unavailable? → Skip tracking
if (DB fails) {
  logger.warn("Database tracking failed");
  // Response still returns to user ✅
}

// MCP remote fails? → Try local
if (Remote MCP fails) {
  logger.warn("Trying local MCP fallback");
  await connectToLocalMcp();
}
```

**Benefit:** System stays operational during partial failures

---

### 3. **Retry with Exponential Backoff**

Used for transient failures:

```typescript
// OpenRouter API retry (axios-retry)
Retries: 3
Delay: 1s, 2s, 4s (exponential)
Conditions: Network errors, 429, 503, 5xx

// MCP tool execution retry
Retries: 2
Delay: 1s, 2s
Conditions: Any tool execution error
```

**Why?**

- Temporary network issues resolve themselves
- API rate limits reset after delay
- Increases success rate without manual intervention

---

### 4. **Timeout Protection**

Prevents hanging requests:

```typescript
Analysis timeout: 90 seconds      → Total request limit
OpenRouter timeout: 60 seconds    → AI API call limit
MCP health check: 10 seconds      → Connection verification

Implementation:
Promise.race([
  actualOperation(),
  timeoutPromise(90000) // Reject after 90s
])
```

**Why?**

- Prevents resource exhaustion
- User gets error instead of hanging
- Server can handle next request

---

### 5. **Database-First Auth with Fallback**

```typescript
Flow:
1. Try database validation (api_keys table)
   ├─ Success? → Use it ✅
   └─ Fail? → Continue to step 2

2. Fallback to environment variables
   ├─ Compare against API_KEYS in .env
   └─ Success? → Use it ✅

3. Both failed? → 401 Unauthorized ❌
```

**Benefits:**

- Dynamic API key management (add/revoke via DB)
- System works even if DB is down (uses .env)
- Seamless transition from dev to prod

---

### 6. **Cache Key Hashing**

```typescript
Why hash?
- Query: "Show NDVI for Iowa farmland" (30 chars)
- Hash:  "abc123def456..." (16 chars, consistent)

Benefits:
- Shorter keys (memory efficient)
- No special characters (Redis-safe)
- Deterministic (same input = same key)
- Collision-resistant (SHA-256)

Example:
Input: { query: "NDVI Iowa", model: "grok-4.1-fast" }
Key:   "openrouter:3f2a9b1c4d5e6f7a"
```

---

### 7. **Select Clause Optimization**

```typescript
// Before: Returns ALL fields (wasteful)
await prisma.apiUsage.findMany({
  where: { createdAt: { gte: since } },
});
// Returns: id, apiKeyId, endpoint, query, mcpMode, toolUsed, responseTime,
//          success, errorMessage, tokensUsed, cost, ipAddress, userAgent,
//          requestId, createdAt
// Size: ~250KB for 1000 records

// After: Returns ONLY needed fields
await prisma.apiUsage.findMany({
  where: { createdAt: { gte: since } },
  select: { responseTime: true, cost: true, tokensUsed: true },
});
// Returns: responseTime, cost, tokensUsed
// Size: ~45KB for 1000 records (82% smaller!)
```

**Benefits:**

- Faster queries (less data to transfer)
- Lower memory usage
- Reduced network overhead
- Lower database egress costs

---

## Example Request Walkthrough

Let's trace a real request through the entire system:

### Scenario: User asks about farmland NDVI

**Request:**

```bash
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: axion-dev-key-abc123" \
  -d '{"query":"Show NDVI for Iowa farmland"}'
```

---

### **Step-by-Step Execution:**

**⏱️ T+0ms - Request arrives at main.ts**

```
✅ Helmet adds security headers
✅ Compression middleware prepares gzip
✅ CORS check passes (localhost:3000 allowed)
✅ ValidationPipe ready to validate body
```

**⏱️ T+5ms - ApiKeyGuard (guards/api-key.guard.ts)**

```typescript
1. Extract key: "axion-dev-key-abc123"
2. Query database:
   SELECT id, key, name, enabled FROM api_keys
   WHERE key = 'axion-dev-key-abc123'
3. Found! { id: "key_123", name: "Dev Key", enabled: true }
4. Attach to request: req.apiKeyId = "key_123"
5. Allow request ✅
```

**⏱️ T+8ms - ThrottlerGuard**

```typescript
1. Check IP: 127.0.0.1
2. Check endpoint: POST /api/geospatial/analyze
3. Rate limit: 10 requests/min
4. Current count: 3 requests in last minute
5. Allow request ✅ (3 < 10)
```

**⏱️ T+10ms - Controller (geospatial.controller.ts)**

```typescript
1. Route matched: @Post('analyze')
2. Validate body against AnalyzeDto:
   - query: "Show NDVI for Iowa farmland" ✅ (string, non-empty)
3. Extract metadata:
   - IP: 127.0.0.1
   - User-Agent: curl/7.68.0
4. Call service:
   geospatialService.analyzeQuery(
     "Show NDVI for Iowa farmland",
     { apiKeyId: "key_123", ipAddress: "127.0.0.1", userAgent: "curl/7.68.0" }
   )
```

**⏱️ T+12ms - Service (geospatial.service.ts)**

```typescript
1. Generate requestId: "req_1738077012345_abc123def"
2. Start timer: startTime = 1738077012345
3. Log: "Analysis started, requestId: req_..., query: Show NDVI..."
4. Validate MCP: mcpConnected = true ✅
5. Validate API key: openRouterApiKey = "sk-or-v1-..." ✅
```

**⏱️ T+15ms - Cache Check (cache.service.ts)**

```typescript
1. Generate cache key:
   - Input: { query: "Show NDVI for Iowa farmland", model: "grok-4.1-fast" }
   - Hash: SHA-256 → "3f2a9b1c4d5e6f7a"
   - Key: "openrouter:3f2a9b1c4d5e6f7a"

2. Check Redis:
   const cached = await redis.get("openrouter:3f2a9b1c4d5e6f7a");
   // Result: null (first time asking this question)

3. Log: "Cache MISS for OpenRouter: openrouter:3f2a9b1c..."
4. Return null → Continue to AI call
```

**⏱️ T+20ms - Get MCP Tools**

```typescript
1. Call: await mcpClient.listTools()
2. Response: 6 tools available
   [
     { name: "axion_data", description: "Search STAC catalog..." },
     { name: "axion_system", description: "Site analysis..." },
     { name: "axion_map", description: "Generate maps..." },
     { name: "axion_process", description: "Process imagery..." },
     { name: "axion_export", description: "Export data..." },
     { name: "axion_classification", description: "Classify land..." }
   ]

3. Convert to OpenRouter format:
   [
     {
       type: "function",
       function: {
         name: "axion_system",
         description: "Analyze site suitability, calculate NDVI...",
         parameters: { ... }
       }
     },
     ...
   ]
```

**⏱️ T+25ms → T+2500ms - OpenRouter AI Call**

```typescript
1. Prepare request:
   POST https://openrouter.ai/api/v1/chat/completions
   Headers:
     Authorization: Bearer sk-or-v1-691124...
     Content-Type: application/json

   Body:
   {
     model: "x-ai/grok-4.1-fast",
     messages: [
       {
         role: "system",
         content: "You are a geospatial analysis assistant..."
       },
       {
         role: "user",
         content: "Show NDVI for Iowa farmland"
       }
     ],
     tools: [ ... 6 tools ... ]
   }

2. Send request (with retry logic: 3 attempts, 60s timeout)

3. Wait for response...

4. Response received:
   {
     choices: [{
       message: {
         role: "assistant",
         tool_calls: [{
           id: "call_abc123",
           type: "function",
           function: {
             name: "axion_system",
             arguments: '{"location":"Iowa","projectType":"agricultural"}'
           }
         }]
       }
     }]
   }

5. AI wants to use tool: axion_system ✅
```

**⏱️ T+2500ms → T+3000ms - Execute MCP Tool**

```typescript
1. Parse arguments:
   { location: "Iowa", projectType: "agricultural" }

2. Call MCP tool (with retry: 2 attempts):
   await mcpClient.callTool({
     name: "axion_system",
     arguments: { location: "Iowa", projectType: "agricultural" }
   })

3. MCP server processes:
   - Searches STAC catalog for Iowa satellite imagery
   - Downloads Sentinel-2 images
   - Calculates NDVI (vegetation health)
   - Generates visualization
   - Returns results

4. Tool response:
   {
     content: [{
       type: "text",
       text: JSON.stringify({
         ndvi: 0.72,
         ndbi: 0.15,
         ndwi: 0.45,
         suitabilityScore: 85,
         visualizationUrl: "https://titiler.xyz/stac/info?url=...",
         analysis: "Healthy vegetation detected..."
       })
     }]
   }
```

**⏱️ T+3000ms → T+3500ms - Final AI Response**

```typescript
1. Send tool result back to OpenRouter:
   POST https://openrouter.ai/api/v1/chat/completions
   Body:
   {
     model: "x-ai/grok-4.1-fast",
     messages: [
       { role: "system", content: "..." },
       { role: "user", content: "Show NDVI for Iowa farmland" },
       { role: "assistant", tool_calls: [...] },  // Previous AI response
       {
         role: "tool",
         tool_call_id: "call_abc123",
         content: JSON.stringify({ ndvi: 0.72, ... })
       }
     ]
   }

2. AI generates natural language explanation:
   {
     choices: [{
       message: {
         role: "assistant",
         content: "The Iowa farmland shows healthy vegetation with an NDVI value of 0.72, indicating strong photosynthetic activity. The area is highly suitable for agricultural use with a score of 85/100. The NDWI value of 0.45 suggests adequate soil moisture."
       }
     }]
   }

3. Format response:
   {
     success: true,
     response: "The Iowa farmland shows healthy vegetation...",
     data: { ndvi: 0.72, ndbi: 0.15, ... },
     visualizationUrl: "https://titiler.xyz/...",
     mcpMode: "remote",
     tool: { name: "axion_system" }
   }
```

**⏱️ T+3500ms - Cache Result (fire-and-forget)**

```typescript
1. Call (non-blocking):
   cacheService.cacheOpenRouterResponse(
     "Show NDVI for Iowa farmland",
     "grok-4.1-fast",
     { success: true, response: "...", data: {...}, ... }
   )

2. Background process:
   - Key: "openrouter:3f2a9b1c4d5e6f7a"
   - TTL: 3600 seconds (1 hour)
   - Store in Redis: SET key value EX 3600
   - Log: "Cached OpenRouter response: openrouter:3f2a..."

3. Main thread continues immediately (doesn't wait) ✅
```

**⏱️ T+3500ms - Track Usage (fire-and-forget)**

```typescript
1. Call (non-blocking):
   databaseService.trackUsage({
     apiKeyId: "key_123",
     endpoint: "/api/geospatial/analyze",
     query: "Show NDVI for Iowa farmland",
     mcpMode: "remote",
     toolUsed: "axion_system",
     responseTime: 3488,
     success: true,
     tokensUsed: 2500,
     cost: 0.00125,
     ipAddress: "127.0.0.1",
     userAgent: "curl/7.68.0",
     requestId: "req_1738077012345_abc123def"
   })

2. Background process:
   INSERT INTO api_usage (
     api_key_id, endpoint, query, mcp_mode, tool_used,
     response_time, success, tokens_used, cost,
     ip_address, user_agent, request_id, created_at
   ) VALUES (...)

3. Main thread continues immediately (doesn't wait) ✅
```

**⏱️ T+3500ms - Add Cache Headers (cache-control.interceptor.ts)**

```typescript
1. Detect endpoint: /api/geospatial/analyze
2. Set header: Cache-Control: private, max-age=3600
3. Express auto-generates: ETag: "abc123def456..."
```

**⏱️ T+3510ms - Compress Response**

```typescript
1. Response size: 45,000 bytes (JSON)
2. Check: size > 1024 bytes? ✅
3. Compress with gzip (level 6)
4. Compressed size: 6,000 bytes (87% reduction!)
5. Set header: Content-Encoding: gzip
```

**⏱️ T+3512ms - Response Sent**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Encoding: gzip
Content-Length: 6000
Cache-Control: private, max-age=3600
ETag: "abc123def456"
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block

{
  "success": true,
  "response": "The Iowa farmland shows healthy vegetation with an NDVI value of 0.72...",
  "data": {
    "ndvi": 0.72,
    "ndbi": 0.15,
    "ndwi": 0.45,
    "suitabilityScore": 85
  },
  "visualizationUrl": "https://titiler.xyz/stac/info?url=...",
  "mapUrl": null,
  "mcpMode": "remote",
  "tool": {
    "name": "axion_system"
  }
}
```

**⏱️ T+3515ms - Logging**

```typescript
Winston logs (logs/application-2026-01-27.log):
{
  "message": "Analysis completed",
  "requestId": "req_1738077012345_abc123def",
  "duration": "3488ms",
  "success": true,
  "toolUsed": "axion_system",
  "tokensUsed": 2500,
  "cost": 0.00125,
  "level": "info",
  "timestamp": "2026-01-27T16:30:15.857Z"
}
```

---

### **Second Request (Same Query)**

**⏱️ T+0ms - User asks the same question again**

```bash
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: axion-dev-key-abc123" \
  -d '{"query":"Show NDVI for Iowa farmland"}'
```

**⏱️ T+0ms → T+5ms - Security Layer**

```
Same as before: Helmet, CORS, API Key, Rate Limit ✅
```

**⏱️ T+7ms - Cache Check**

```typescript
1. Generate same cache key: "openrouter:3f2a9b1c4d5e6f7a"
2. Check Redis: GET "openrouter:3f2a9b1c4d5e6f7a"
3. Result: Found! ✅
   {
     success: true,
     response: "The Iowa farmland shows healthy vegetation...",
     data: { ndvi: 0.72, ... },
     visualizationUrl: "https://titiler.xyz/...",
     mcpMode: "remote",
     tool: { name: "axion_system" }
   }
4. Log: "Cache HIT for OpenRouter: openrouter:3f2a..."
5. Add flag: fromCache: true
6. Return immediately ⚡
```

**⏱️ T+8ms - Response Sent**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Encoding: gzip
Content-Length: 6010
Cache-Control: private, max-age=3600
ETag: "abc123def456"

{
  "success": true,
  "response": "The Iowa farmland shows healthy vegetation...",
  "data": { "ndvi": 0.72, ... },
  "visualizationUrl": "https://titiler.xyz/...",
  "mcpMode": "remote",
  "tool": { "name": "axion_system" },
  "fromCache": true  ← Indicates cached response
}
```

**Total time: 8ms (437x faster!) ⚡**

**Savings:**

- No OpenRouter API call → $0.00125 saved
- No MCP tool execution → 3 seconds saved
- No database writes → minimal impact
- User gets instant response → excellent UX

---

## Summary for Your Colleague

**"Here's how our system works in simple terms:"**

1. **Request comes in** → Goes through security (API key + rate limit)
2. **Optimization layer** → Adds compression, security headers
3. **Cache check** → If we've seen this before, return instantly
4. **If not cached** → Ask AI (OpenRouter) what to do
5. **AI uses tools** → Executes satellite imagery analysis (MCP server)
6. **Get results** → Format and cache for next time
7. **Track everything** → Store in database for analytics
8. **Return to user** → Compressed, secured, logged

**Key files to understand:**

- `main.ts` - Where it all starts
- `geospatial.controller.ts` - HTTP endpoints
- `geospatial.service.ts` - Main business logic
- `cache.service.ts` - Performance optimization
- `database.service.ts` - Data persistence

**Performance highlights:**

- First request: 3.5 seconds (full AI + satellite processing)
- Cached request: 8ms (instant retrieval)
- 87% smaller responses (compression)
- 80% cost savings (caching)

**The system is designed to:**

- ✅ Stay fast (caching, compression)
- ✅ Stay secure (Helmet, API keys, rate limiting)
- ✅ Stay reliable (retry logic, fallbacks, graceful degradation)
- ✅ Stay observable (logging, metrics, error tracking)

---

That's the complete flow! Any questions? 🚀
