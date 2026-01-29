# AXION BACKEND - RAILWAY DEPLOYMENT GUIDE

Complete guide for deploying Axion Backend to Railway.app with production configuration.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Deployment Architecture](#deployment-architecture)
3. [Option A: Separate Deployment (Recommended)](#option-a-separate-deployment-recommended)
4. [Option B: Embedded Deployment](#option-b-embedded-deployment)
5. [Post-Deployment Steps](#post-deployment-steps)
6. [Team Access Setup](#team-access-setup)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. Railway Account Setup

```bash
# Create account at https://railway.app
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login
```

### 2. External Services

- **Neon DB**: PostgreSQL database (already configured)
  - URL: Get from https://console.neon.tech
- **OpenRouter API**: AI model access
  - Get API key from https://openrouter.ai/keys
- **Upstash Redis** (Optional but recommended):
  - Get credentials from https://console.upstash.com
- **Sentry** (Optional - error tracking):
  - Get DSN from https://sentry.io

### 3. Prepare Repository

```bash
# Ensure all changes are committed
git add .
git commit -m "feat: add Docker and Railway configuration"
git push origin master
```

---

## Deployment Architecture

### Option A: Separate Deployment (Recommended) ⭐

```
Railway Project: axion-production
├── Service 1: axion-backend (NestJS)
│   ├── Cost: ~$5/month
│   ├── Port: 3001
│   ├── Public URL: https://axion-backend.railway.app
│   └── Connects to: axion-mcp (internal)
│
└── Service 2: axion-mcp (MCP Server)
    ├── Cost: ~$5/month
    ├── Port: 3000
    ├── Internal URL: http://axion-mcp.railway.internal:3000
    └── Not exposed to public internet
```

**Total Cost**: $10/month

**Benefits**:

- Independent scaling
- Separate deployments
- Better fault isolation
- Easier debugging
- Industry best practice

### Option B: Embedded Deployment

```
Railway Project: axion-production
└── Service: axion-backend (NestJS + MCP)
    ├── Cost: ~$5/month
    ├── Port: 3001
    └── Public URL: https://axion-backend.railway.app
```

**Total Cost**: $5/month

**Drawbacks**:

- Resource contention
- Single point of failure
- Harder to scale
- Complex updates

---

## Option A: Separate Deployment (Recommended)

### Step 1: Create Railway Project

```bash
# Create new project
railway init

# Enter project name
axion-production
```

### Step 2: Deploy MCP Server First

```bash
# Navigate to MCP server directory
cd mcp-server

# Initialize Railway service
railway service create axion-mcp

# Set environment variables
railway variables set PORT=3000
railway variables set NODE_ENV=production
railway variables set MCP_API_KEY=$(openssl rand -hex 32)
railway variables set LOG_LEVEL=info

# Deploy
railway up

# Get the Railway internal URL
railway domain
# Example output: axion-mcp.railway.app
# Internal URL will be: axion-mcp.railway.internal:3000

# Note down the MCP_API_KEY for next step
railway variables get MCP_API_KEY
```

### Step 3: Deploy NestJS Backend

```bash
# Navigate back to project root
cd ..

# Create backend service
railway service create axion-backend

# Set environment variables
railway variables set PORT=3001
railway variables set NODE_ENV=production

# OpenRouter
railway variables set OPENROUTER_API_KEY=sk-or-v1-your-key
railway variables set OPENROUTER_MODEL=x-ai/grok-4.1-fast

# MCP Configuration (use internal Railway networking)
railway variables set MCP_MODE=remote
railway variables set MCP_REMOTE_URL=http://axion-mcp.railway.internal:3000
railway variables set MCP_API_KEY=<key-from-step-2>

# Database (Neon)
railway variables set DATABASE_URL=<your-neon-connection-string>
railway variables set DATA_RETENTION_DAYS=90

# Redis (Upstash) - HIGHLY RECOMMENDED for production
railway variables set UPSTASH_REDIS_URL=<your-redis-url>
railway variables set UPSTASH_REDIS_TOKEN=<your-redis-token>

# Security
railway variables set API_KEYS=$(openssl rand -hex 32),$(openssl rand -hex 32)
railway variables set ALLOWED_ORIGINS=https://yourfrontend.com

# Monitoring
railway variables set SENTRY_DSN=<your-sentry-dsn>
railway variables set SENTRY_ENVIRONMENT=production

# Deploy
railway up

# Get public URL
railway domain
# Example: axion-backend.railway.app
```

### Step 4: Configure Custom Domain (Optional)

```bash
# Add custom domain
railway domain add api.yourdomain.com

# Add DNS CNAME record:
# api.yourdomain.com -> axion-backend.railway.app
```

---

## Option B: Embedded Deployment

### Step 1: Create Railway Project

```bash
railway init
# Project name: axion-production
```

### Step 2: Deploy Single Service

```bash
# Create service
railway service create axion-backend

# Set environment variables
railway variables set PORT=3001
railway variables set NODE_ENV=production

# OpenRouter
railway variables set OPENROUTER_API_KEY=sk-or-v1-your-key
railway variables set OPENROUTER_MODEL=x-ai/grok-4.1-fast

# MCP Configuration (local/embedded)
railway variables set MCP_MODE=local
railway variables set MCP_SERVER_PATH=dist/mcp/mcp-server.js

# Database
railway variables set DATABASE_URL=<your-neon-connection-string>
railway variables set DATA_RETENTION_DAYS=90

# Redis (optional)
railway variables set UPSTASH_REDIS_URL=<your-redis-url>
railway variables set UPSTASH_REDIS_TOKEN=<your-redis-token>

# Security
railway variables set API_KEYS=$(openssl rand -hex 32)
railway variables set ALLOWED_ORIGINS=https://yourfrontend.com

# Monitoring
railway variables set SENTRY_DSN=<your-sentry-dsn>
railway variables set SENTRY_ENVIRONMENT=production

# Deploy
railway up
```

---

## Post-Deployment Steps

### 1. Verify Health

```bash
# Test backend health
curl https://axion-backend.railway.app/api/geospatial/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-01-29T...",
  "uptime": 123.45,
  "environment": "production",
  "version": "1.0.0"
}

# If using separate deployment, test MCP health
curl https://axion-mcp.railway.app/health

# Expected response:
{
  "status": "ok",
  "service": "axion-mcp-server",
  "version": "1.0.0",
  "timestamp": "2026-01-29T..."
}
```

### 2. Test API Endpoint

```bash
# Get an API key from Railway variables
railway variables get API_KEYS

# Test analyze endpoint
curl -X POST https://axion-backend.railway.app/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{
    "operation": "site_analysis",
    "latitude": 18.5204,
    "longitude": 73.8567,
    "radius": 2000,
    "projectType": "residential"
  }'
```

### 3. Run Database Migrations

```bash
# Connect to Railway service
railway run npx prisma migrate deploy

# Verify database connection
railway run npx prisma db pull
```

### 4. Set Up Monitoring

#### UptimeRobot (Free Monitoring)

1. Go to https://uptimerobot.com
2. Create monitors:
   - **Backend Health**: `https://axion-backend.railway.app/api/geospatial/health`
   - **MCP Health** (if separate): `https://axion-mcp.railway.app/health`
3. Set check interval: 5 minutes
4. Configure alerts to your email

#### Sentry Error Tracking

1. Verify Sentry is receiving errors:
   - Go to https://sentry.io/issues/
   - Check for initial connection event
2. Set up alerts for error rate thresholds

---

## Team Access Setup

### For Team Members Using Shared MCP

If you deployed with **Option A (Separate Deployment)**, team members can connect their local NestJS development environment to the shared production MCP server.

#### Team Member Local Setup

```bash
# 1. Clone repository
git clone https://github.com/Gauravr08/Axion_backend.git
cd axion-backend

# 2. Install dependencies
npm install

# 3. Create .env file for development
cp .env.example .env

# 4. Configure to use shared MCP
# Edit .env:
MCP_MODE=remote
MCP_REMOTE_URL=https://axion-mcp.railway.app
# Or use internal Railway URL if on Railway:
# MCP_REMOTE_URL=http://axion-mcp.railway.internal:3000
MCP_API_KEY=<shared-team-mcp-key>

# Configure local database (or use shared Neon)
DATABASE_URL=<local-or-shared-database-url>

# Add local API key for testing
API_KEYS=dev-local-key-12345

# 5. Start development
npm run start:dev

# Server runs on http://localhost:3001
# Uses shared MCP server for satellite imagery processing
```

#### Security Notes

- **MCP API Key**: Share via secure channel (1Password, LastPass, Bitwarden)
- **Production API Keys**: Never share production API keys with team
- **Database**: Consider using separate dev database

---

## Monitoring & Maintenance

### View Logs

```bash
# Backend logs
railway logs --service axion-backend

# MCP logs (if separate)
railway logs --service axion-mcp

# Follow logs in real-time
railway logs --service axion-backend --follow
```

### Check Resource Usage

```bash
# View metrics
railway metrics --service axion-backend

# Or visit Railway Dashboard:
# https://railway.app/project/<your-project-id>
```

### Update Environment Variables

```bash
# List all variables
railway variables

# Update a variable
railway variables set VARIABLE_NAME=new-value

# Delete a variable
railway variables delete VARIABLE_NAME

# After changing variables, Railway auto-redeploys
```

### Redeploy

```bash
# Trigger redeployment
railway up

# Rollback to previous deployment
railway rollback
```

### Scale Resources

```bash
# Railway auto-scales based on usage
# To set custom limits, go to Railway Dashboard:
# Project > Service > Settings > Resources

# Recommended starting resources:
# - Memory: 512MB
# - CPU: Shared (auto-scales)
```

---

## Troubleshooting

### Issue: Health Check Failing

```bash
# Check logs
railway logs --service axion-backend

# Common causes:
# 1. Database connection failed
#    - Verify DATABASE_URL is correct
#    - Check Neon DB is running
#
# 2. Port mismatch
#    - Railway auto-assigns PORT variable
#    - Ensure app listens on process.env.PORT
#
# 3. Build failed
#    - Check for TypeScript errors
#    - Run `npm run build` locally first
```

### Issue: MCP Connection Timeout

```bash
# If using separate MCP deployment:

# 1. Verify MCP is running
railway logs --service axion-mcp
curl https://axion-mcp.railway.app/health

# 2. Check MCP_REMOTE_URL in backend
railway variables get MCP_REMOTE_URL
# Should be: http://axion-mcp.railway.internal:3000

# 3. Verify API key matches
railway variables get MCP_API_KEY --service axion-mcp
railway variables get MCP_API_KEY --service axion-backend
```

### Issue: High Memory Usage

```bash
# Check memory usage
railway metrics --service axion-backend

# Solutions:
# 1. Enable Redis caching (reduces memory usage)
# 2. Increase memory limit in Railway dashboard
# 3. If using embedded: Switch to separate deployment
```

### Issue: Slow Response Times

```bash
# Check if Redis is configured
railway variables get UPSTASH_REDIS_URL

# If not configured:
# 1. Create Upstash Redis account
# 2. Set Redis variables
# 3. Redeploy

# Verify caching is working:
# - First request: ~3.5s
# - Cached request: ~8ms
```

### Issue: Database Connection Pool Exhausted

```bash
# Check DATABASE_URL format
railway variables get DATABASE_URL

# Ensure it includes connection pooling:
# postgresql://user:pass@host/db?pgbouncer=true&connection_limit=10

# In Neon dashboard:
# Use "Pooled connection" string, not "Direct connection"
```

---

## Cost Optimization

### Current Cost Estimate

**Option A (Separate - Recommended):**

- NestJS Backend: ~$5/month
- MCP Server: ~$5/month
- **Total: ~$10/month**

**Option B (Embedded):**

- Combined Service: ~$5/month
- **Total: ~$5/month**

### Free Tier Usage

Railway provides $5 free credit per month:

- **Embedded deployment**: Essentially FREE
- **Separate deployment**: Only $5/month after credit

### Reducing Costs

1. **Use Redis caching**: Reduces API calls (saves $20/month on OpenRouter)
2. **Set DATA_RETENTION_DAYS**: Clean old database records
3. **Monitor usage**: Railway Dashboard shows real-time costs
4. **Scale down during low traffic**: Adjust resources as needed

---

## Next Steps

1. ✅ Deploy to Railway (this guide)
2. ⏭️ Set up CI/CD with GitHub Actions
3. ⏭️ Configure domain and SSL
4. ⏭️ Set up monitoring alerts
5. ⏭️ Load testing and optimization
6. ⏭️ Documentation for end users

---

## Support & Resources

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Neon DB Docs**: https://neon.tech/docs
- **OpenRouter Docs**: https://openrouter.ai/docs
- **Upstash Docs**: https://docs.upstash.com

---

**Deployment completed! 🚀**

Your Axion Backend is now running in production on Railway.
