# Database Setup Guide (Day 3)

## Quick Start

### Step 1: Get a Database

**Option A: Neon DB (Recommended - Free Tier)**

1. Go to https://neon.tech
2. Sign up / Log in
3. Create new project
4. Copy connection string

**Option B: Local PostgreSQL**

```bash
docker run --name axion-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
```

### Step 2: Configure .env

Add to your `.env` file:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

**Example for Neon:**

```env
DATABASE_URL=postgresql://username:password@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Example for Local:**

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/axion?sslmode=prefer
```

### Step 3: Run Migrations

```bash
# Generate Prisma Client
npx prisma generate

# Create database tables
npx prisma migrate dev --name init
```

**Expected Output:**

```
✔ Generated Prisma Client
✔ Applied migration: 20260127_init
```

### Step 4: Start Application

```bash
npm run start:dev
```

**Expected Logs:**

```
✅ Loaded 2 API keys from environment
✅ Database connection established
✅ Database validation enabled
Seeded 2 API keys
```

### Step 5: Test It

```bash
# Make a request (creates usage record)
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: axion-dev-key-abc123" \
  -d '{"query":"Show NDVI for Iowa farmland"}'

# Check analytics
curl http://localhost:3001/api/geospatial/analytics \
  -H "x-api-key: axion-dev-key-abc123"
```

### Step 6: View Data in Prisma Studio

```bash
npx prisma studio
```

Open browser at http://localhost:5555 and check:

- `ApiKey` table → Your seeded API keys
- `ApiUsage` table → Request logs with timing, tokens, costs

---

## Without Database (Fallback Mode)

If you skip database setup:

- App still works ✅
- API key validation uses environment variables ✅
- Usage tracking silently fails (logged as warning) ⚠️
- Analytics endpoint returns empty data ⚠️

---

## Useful Commands

```bash
# Generate Prisma Client (after schema changes)
npx prisma generate

# Create migration
npx prisma migrate dev --name migration_name

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# View database in browser
npx prisma studio

# Format schema
npx prisma format
```

---

## Troubleshooting

### "Can't reach database server"

- Check DATABASE_URL is correct
- For Neon: Ensure connection string includes `?sslmode=require`
- For local: Ensure PostgreSQL is running (`docker ps`)

### "relation does not exist"

- Run: `npx prisma migrate dev`

### "Generated Prisma Client does not match"

- Run: `npx prisma generate`

### App starts but no usage tracking

- Check logs for database connection warnings
- Verify DATABASE_URL in .env
- Usage tracking fails silently to not break requests

---

## Data Retention Warning

At 10K-100K requests/day, the ApiUsage table grows quickly:

- 10K req/day = 300K records/month (~50MB)
- 100K req/day = 3M records/month (~500MB)

Free tier Neon DB (0.5GB) will last ~2-3 weeks at high traffic.

**Solution:** We'll add automatic cleanup in Day 4.
