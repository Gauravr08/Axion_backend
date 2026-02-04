# Axion Backend API - Handoff Documentation

## 🚀 Overview
Production-ready geospatial analysis API using Sentinel-2 satellite imagery with AI-powered natural language processing.

## 📡 Base URL
- **Development**: `http://localhost:3001`
- **Production**: Your deployment URL (Railway/Render/etc.)

## 🔑 Authentication
All API endpoints require an `x-api-key` header:
```bash
x-api-key: your-api-key-here
```

**Available API Keys** (configured in `.env`):
- `axion-dev-key-abc123` (development)
- `axion-prod-key-xyz789` (production)

## 📍 API Endpoints

### 1. Geospatial Analysis (Main Endpoint)
**POST** `/api/geospatial/analyze`

Analyze any location using natural language queries. Powered by Grok AI + Sentinel-2 satellite data.

**Request Body:**
```json
{
  "query": "Analyze Iowa farmland for agriculture"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": "Detailed AI analysis of the area...",
    "suitabilityScore": 57.8,
    "spectralAnalysis": {
      "indices": {
        "ndvi": 0.065,
        "ndbi": -0.581,
        "ndwi": -0.107,
        "ndmi": 0.581
      },
      "interpretation": {
        "vegetation": "Low vegetation cover (winter season)",
        "builtUp": "Minimal urban development",
        "water": "Moderate water content",
        "moisture": "Good soil moisture levels"
      }
    },
    "metadata": {
      "satellite": "Sentinel-2",
      "date": "2026-01-28",
      "cloudCover": 5.2,
      "location": {
        "bbox": [-96.6, 40.4, -90.1, 43.5],
        "center": [-93.35, 41.95]
      }
    }
  },
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

**Key Spectral Indices:**
- **NDVI** (Normalized Difference Vegetation Index): -1 to 1
  - > 0.3: Dense vegetation
  - 0.1-0.3: Sparse vegetation
  - < 0.1: Barren/urban
- **NDBI** (Normalized Difference Built-up Index): -1 to 1
  - > 0: Urban areas
  - < 0: Non-urban
- **NDWI** (Normalized Difference Water Index): -1 to 1
  - > 0.3: Water bodies
  - 0-0.3: Moisture
- **NDMI** (Normalized Difference Moisture Index): -1 to 1
  - > 0.3: High moisture
  - 0-0.3: Moderate moisture

**Rate Limits:** 10 requests/minute per IP

---

### 2. Health Check
**GET** `/api/geospatial/health`

Check API status and configuration.

**Response:**
```json
{
  "success": true,
  "status": "Custom satellite processing active",
  "processingMode": "custom",
  "stacEndpoint": "https://earth-search.aws.element84.com/v1",
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

---

### 3. Analytics Dashboard
**GET** `/api/geospatial/analytics`

Retrieve aggregated usage statistics.

**Response:**
```json
{
  "totalRequests": 150,
  "successRate": 94.5,
  "averageProcessingTime": "25.3s",
  "topQueries": [
    { "query": "Iowa farmland", "count": 25 },
    { "query": "California solar sites", "count": 18 }
  ],
  "period": "last_30_days"
}
```

---

### 4. System Metrics
**GET** `/api/geospatial/metrics`

Real-time system performance metrics.

**Response:**
```json
{
  "uptime": "48h 23m",
  "memoryUsage": "512 MB",
  "activeConnections": 3,
  "queueStatus": "unavailable",
  "cacheHitRate": "78.5%"
}
```

---

## 🌍 Interactive API Documentation
**Swagger UI**: `http://localhost:3001/api/docs`

Full interactive documentation with:
- Request/response examples
- Try-it-out functionality
- Schema definitions
- Authentication testing

---

## 🛠️ Environment Variables

```bash
# Core Configuration
PORT=3001
NODE_ENV=production

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# AI Processing
OPENROUTER_API_KEY=your-key-here

# API Security
API_KEY_1=axion-prod-key-xyz789
API_KEY_2=axion-backup-key-abc456
DISABLE_API_KEY_AUTH=false

# CORS
ALLOWED_ORIGINS=https://yourfrontend.com,https://app.yourcompany.com

# Optional: Redis (for job queues)
UPSTASH_REDIS_URL=redis://...

# Optional: Error Tracking
SENTRY_DSN=https://...
```

---

## 📊 Example Usage

### cURL
```bash
curl -X POST http://localhost:3001/api/geospatial/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: axion-dev-key-abc123" \
  -d '{
    "query": "Find suitable locations for wind farms in Kansas"
  }'
```

### JavaScript/TypeScript
```typescript
const response = await fetch('http://localhost:3001/api/geospatial/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'axion-dev-key-abc123'
  },
  body: JSON.stringify({
    query: 'Analyze Iowa farmland for agriculture'
  })
});

const data = await response.json();
console.log('Suitability Score:', data.data.suitabilityScore);
console.log('NDVI:', data.data.spectralAnalysis.indices.ndvi);
```

### Python
```python
import requests

response = requests.post(
    'http://localhost:3001/api/geospatial/analyze',
    headers={
        'Content-Type': 'application/json',
        'x-api-key': 'axion-dev-key-abc123'
    },
    json={'query': 'Analyze California desert for solar panels'}
)

data = response.json()
print(f"Suitability: {data['data']['suitabilityScore']}%")
print(f"NDVI: {data['data']['spectralAnalysis']['indices']['ndvi']}")
```

---

## ⚡ Performance Characteristics

- **Average Response Time**: 20-30 seconds (depends on area size)
- **Success Rate**: 90%+ (with retry logic for satellite data fetching)
- **Max Concurrent Requests**: 20 (configurable via rate limiting)
- **Data Freshness**: Sentinel-2 imagery updated every 5 days
- **Coverage**: Global (any location on Earth)

---

## 🔧 Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Client    │────▶│  NestJS API  │────▶│  Grok AI (LLM)  │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ STAC Catalog │
                    │  (Sentinel-2) │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  COG Processor│
                    │ (Spectral     │
                    │  Analysis)    │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  PostgreSQL  │
                    │   (Neon DB)  │
                    └──────────────┘
```

**Key Components:**
1. **Grok AI**: Natural language → structured geospatial query
2. **STAC API**: Find Sentinel-2 satellite imagery
3. **COG Processor**: Calculate spectral indices (NDVI, NDBI, etc.)
4. **PostgreSQL**: Store analysis history and metrics

---

## 🚨 Error Handling

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": ["query must not be empty"]
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Invalid API key"
}
```

### 429 Too Many Requests
```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded. Please try again later."
}
```

### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Satellite data processing failed",
  "error": "Network timeout while fetching COG data"
}
```

---

## 🔍 Query Examples

**Agricultural Analysis:**
```json
{"query": "Analyze Iowa farmland for corn production"}
{"query": "Find best agricultural areas in Central Valley California"}
{"query": "Assess soil moisture in Nebraska wheat fields"}
```

**Solar Site Selection:**
```json
{"query": "Identify suitable solar farm locations in Arizona desert"}
{"query": "Analyze California desert for solar panel installation"}
```

**Urban Planning:**
```json
{"query": "Assess vegetation coverage in downtown Chicago"}
{"query": "Analyze urban heat island effect in Phoenix"}
```

**Environmental Monitoring:**
```json
{"query": "Monitor deforestation in Amazon rainforest region"}
{"query": "Track water levels in Lake Mead Nevada"}
```

---

## 📦 Deployment

### Local Development
```bash
npm install
npm run start:dev
```

### Production Build
```bash
npm run build
npm run start:prod
```

### Docker
```bash
docker build -t axion-backend .
docker run -p 3001:3001 --env-file .env axion-backend
```

### Railway/Render
1. Connect GitHub repository
2. Set environment variables
3. Deploy automatically on push to `main`

---

## 🔐 Security Features

- ✅ Helmet.js security headers
- ✅ CORS protection
- ✅ Rate limiting (20 req/min general, 10 req/min for analysis)
- ✅ API key authentication
- ✅ Request validation & sanitization
- ✅ HTTPS enforced in production
- ✅ Database connection encryption (SSL)

---

## 📞 Support & Contact

**Technical Issues:**
- Check logs: `npm run start:dev` outputs detailed processing logs
- Swagger UI: `http://localhost:3001/api/docs` for interactive testing
- Health endpoint: `GET /api/geospatial/health`

**Common Issues:**
1. **"No satellite imagery found"** → Area has >90% cloud cover, try different date/location
2. **"Rate limit exceeded"** → Wait 1 minute or contact admin for higher limits
3. **"Invalid API key"** → Check `x-api-key` header matches `.env` configuration

---

## 📚 Additional Resources

- **Sentinel-2 Documentation**: https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2
- **STAC Specification**: https://stacspec.org/
- **Spectral Indices**: https://www.indexdatabase.de/
- **NestJS Docs**: https://docs.nestjs.com/

---

**Last Updated**: February 4, 2026
**API Version**: 1.0.0
**Backend Framework**: NestJS 10.4.22
**Node.js Version**: 22.17.1
