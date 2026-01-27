# API Testing Guide - Axion Backend

## 🔑 API Keys

Your project has two API keys configured in `.env`:

```
Development Key: axion-dev-key-abc123
Test Key:        axion-test-key-xyz789
```

**Important:** Anyone with these keys can access your API. Keep them secret!

---

## 📡 Available Endpoints

### 1. Health Check (Public - No Auth Required)

```bash
GET http://localhost:3001/api/geospatial/health
```

**Test Command:**

```bash
curl http://localhost:3001/api/geospatial/health
```

**Expected Response:**

```json
{
  "success": true,
  "status": "MCP server running",
  "mcpConnected": true,
  "mcpMode": "remote",
  "timestamp": "2026-01-27T07:01:31.674Z"
}
```

---

### 2. Analyze Query (Protected - Requires API Key)

```bash
POST http://localhost:3001/api/geospatial/analyze
Headers:
  - Content-Type: application/json
  - x-api-key: axion-dev-key-abc123
Body:
  {
    "query": "Your geospatial query here"
  }
```

**Test Command:**

```bash
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: axion-dev-key-abc123" \
  -d '{"query":"Show me NDVI vegetation health for Iowa farmland"}'
```

---

## ✅ Test Results (Verified)

### ✓ Test 1: Health Check (No Auth)

```bash
curl http://localhost:3001/api/geospatial/health
```

**Result:** ✅ SUCCESS

```json
{ "success": true, "mcpConnected": true, "mcpMode": "remote" }
```

### ✓ Test 2: Analyze Without API Key (Should Fail)

```bash
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -d '{"query":"Show NDVI for Iowa"}'
```

**Result:** ✅ CORRECTLY REJECTED

```json
{
  "statusCode": 401,
  "message": "API key is required. Include \"x-api-key\" header.",
  "error": "Unauthorized"
}
```

### ✓ Test 3: Analyze With Wrong API Key (Should Fail)

```bash
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: wrong-key-123" \
  -d '{"query":"Show NDVI for Iowa"}'
```

**Result:** ✅ CORRECTLY REJECTED

```json
{
  "statusCode": 401,
  "message": "Invalid API key",
  "error": "Unauthorized"
}
```

### ✓ Test 4: Analyze With Correct API Key (Should Work)

```bash
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: axion-dev-key-abc123" \
  -d '{"query":"Show NDVI for Iowa farmland"}'
```

**Result:** ✅ SUCCESS (200 OK)

```json
{
  "success": true,
  "response": "Analysis complete",
  "data": { ... },
  "mcpMode": "remote"
}
```

---

## 🧪 Test Using Swagger UI (Recommended)

1. **Open Swagger UI:**

   ```
   http://localhost:3001/api/docs
   ```

2. **Authorize:**
   - Click the 🔓 **"Authorize"** button (top right)
   - Enter API key: `axion-dev-key-abc123`
   - Click **"Authorize"**
   - Click **"Close"**

3. **Test Endpoint:**
   - Expand `POST /api/geospatial/analyze`
   - Click **"Try it out"**
   - Enter query in the request body:
     ```json
     {
       "query": "Show me NDVI vegetation health for Iowa farmland"
     }
     ```
   - Click **"Execute"**

4. **View Results:**
   - Scroll down to see the response
   - Should show `200` status code
   - Response includes analysis data

---

## 🧪 Test Using Postman

1. **Create New Request:**
   - Method: `POST`
   - URL: `http://localhost:3001/api/geospatial/analyze`

2. **Add Headers:**
   - `Content-Type`: `application/json`
   - `x-api-key`: `axion-dev-key-abc123`

3. **Add Body (raw JSON):**

   ```json
   {
     "query": "Show me NDVI vegetation health for Iowa farmland"
   }
   ```

4. **Send Request**

---

## 🚨 Common Errors

### 401 Unauthorized

```json
{ "statusCode": 401, "message": "API key is required..." }
```

**Fix:** Add `x-api-key` header with valid key

### 400 Bad Request

```json
{ "statusCode": 400, "message": "Query must be at least 10 characters..." }
```

**Fix:** Ensure query is 10-500 characters and uses only valid characters

### 429 Too Many Requests

```json
{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }
```

**Fix:** Wait 1 minute. Rate limit is 10 requests/minute for analyze endpoint

---

## 📊 Rate Limits

| Endpoint                  | Rate Limit         |
| ------------------------- | ------------------ |
| `/api/geospatial/health`  | Unlimited (public) |
| `/api/geospatial/analyze` | 10 requests/minute |
| Other endpoints           | 20 requests/minute |

---

## 🔧 Input Validation Rules

### Query Field:

- **Type:** String
- **Min Length:** 10 characters
- **Max Length:** 500 characters
- **Allowed Characters:** Letters, numbers, spaces, and: `,` `.` `-` `?` `!` `(` `)`
- **Not Allowed:** Special characters like `<` `>` `&` `"` `'` `/` etc.

### Valid Examples:

✅ `"Show me NDVI vegetation health for Iowa farmland"`
✅ `"Analyze urban growth in Austin, Texas"`
✅ `"Calculate water indices for Lake Tahoe (2024)"`

### Invalid Examples:

❌ `"test"` - Too short (< 10 chars)
❌ `"x".repeat(501)` - Too long (> 500 chars)
❌ `"Show NDVI <script>alert(1)</script>"` - Invalid characters

---

## 🔐 Security Features Active

✅ API Key Authentication
✅ Rate Limiting
✅ Input Validation
✅ CORS Protection
✅ Request Size Limits
✅ Character Whitelisting

---

## 📝 For Your Team

**Share this with your team:**

```markdown
# Axion Backend API Access

**Base URL:** http://localhost:3001 (dev)
**API Documentation:** http://localhost:3001/api/docs

**Authentication:**
Add this header to all requests (except /health):
```

x-api-key: axion-dev-key-abc123

````

**Example Request:**
```bash
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: axion-dev-key-abc123" \
  -d '{"query":"Show NDVI for Iowa farmland"}'
````

**Rate Limit:** 10 requests/minute for analysis
**Query Requirements:** 10-500 characters, alphanumeric + basic punctuation

````

---

## 🎯 Quick Test Script

Save this as `test-api.sh`:
```bash
#!/bin/bash

API_KEY="axion-dev-key-abc123"
BASE_URL="http://localhost:3001"

echo "Testing Axion Backend API..."
echo ""

echo "1. Health Check (no auth):"
curl -s $BASE_URL/api/geospatial/health | jq '.'
echo ""

echo "2. Analyze without auth (should fail):"
curl -s -X POST $BASE_URL/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}' | jq '.'
echo ""

echo "3. Analyze with auth (should work):"
curl -s -X POST $BASE_URL/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"query":"Show NDVI for Iowa farmland"}' | jq '.success'
echo ""
````

Run with: `bash test-api.sh`

---

**Last Updated:** 2026-01-27
**Status:** ✅ All Security Features Working
