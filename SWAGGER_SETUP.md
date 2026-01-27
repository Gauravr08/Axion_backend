# Swagger API Documentation Added! 🎉

## ✅ What Was Added

### 1. Dependencies Installed
```bash
@nestjs/swagger
swagger-ui-express
```

### 2. Swagger Configuration
- **Main.ts**: Configured Swagger with DocumentBuilder
- **Controller**: Added API decorators (@ApiTags, @ApiOperation, @ApiResponse)
- **DTO**: Added @ApiProperty for request validation

### 3. API Documentation Details

**Swagger UI URL**: http://localhost:3001/api/docs

**Features**:
- Interactive API documentation
- Try out endpoints directly in browser
- Request/response schemas
- Example values pre-filled
- No Postman needed!

---

## 🚀 How to Use Swagger

### 1. Open Swagger UI
Navigate to: **http://localhost:3001/api/docs**

### 2. Test Health Endpoint
1. Click on **POST /api/geospatial/health**
2. Click **"Try it out"**
3. Click **"Execute"**
4. See response below

Expected Response:
```json
{
  "success": true,
  "status": "MCP server running",
  "mcpConnected": true,
  "timestamp": "2026-01-20T09:30:00.000Z"
}
```

### 3. Test Analyze Endpoint
1. Click on **POST /api/geospatial/analyze**
2. Click **"Try it out"**
3. Modify the request body:
```json
{
  "query": "Show me NDVI vegetation health for Iowa farmland"
}
```
4. Click **"Execute"**
5. See natural language response + data

**Note**: You need OpenRouter API key in `.env` for this to work!

---

## 📝 Example Queries to Test

Copy these into the Swagger UI request body:

### Agriculture
```json
{
  "query": "Show me NDVI vegetation health for Iowa farmland"
}
```

### Real Estate
```json
{
  "query": "Analyze this location for residential development: 18.52°N, 73.85°E"
}
```

### Urban Planning
```json
{
  "query": "Show urban expansion in Austin, Texas"
}
```

### Water Resources
```json
{
  "query": "Calculate water index for Lake Mead"
}
```

---

## 🎨 Swagger Features

### What You Can See:
- **Request Schema**: What format to send
- **Response Schema**: What you'll get back
- **Status Codes**: 200 (success), 400 (bad request), 500 (error)
- **Example Values**: Pre-filled for testing
- **Model Schemas**: AnalyzeDto structure

### Interactive Testing:
- Click "Try it out"
- Edit request body
- Click "Execute"
- See response immediately
- Copy curl command for CLI testing

---

## 📊 API Documentation

### Endpoints

#### POST /api/geospatial/health
**Summary**: Health check  
**Description**: Check if the MCP server is connected and the API is operational

**Response**:
```typescript
{
  success: boolean;
  status: string;
  mcpConnected: boolean;
  timestamp: string;
}
```

#### POST /api/geospatial/analyze
**Summary**: Analyze geospatial query  
**Description**: Process natural language queries for satellite imagery analysis, vegetation indices (NDVI), urban indices (NDBI), water indices (NDWI), and site suitability assessment.

**Request**:
```typescript
{
  query: string;  // Natural language question
}
```

**Response**:
```typescript
{
  success: boolean;
  response: string;              // Natural language answer from AI
  data?: {                       // Structured metrics
    ndvi?: number;               // Vegetation index (0-1)
    ndbi?: number;               // Built-up index (0-1)
    ndwi?: number;               // Water index (0-1)
    suitabilityScore?: number;   // Site suitability (0-100)
  };
  visualizationUrl?: string;     // Satellite imagery URL
}
```

---

## 🔧 Share with Frontend Team

**Swagger URL**: http://localhost:3001/api/docs

They can:
1. See all available endpoints
2. Test endpoints directly
3. Copy request/response schemas for TypeScript interfaces
4. Export as OpenAPI JSON: http://localhost:3001/api/docs-json

**TypeScript Interface Generation**:
Frontend team can copy schemas directly from Swagger to create TypeScript types!

---

## ✨ Next Steps

1. **Add OpenRouter API Key** to `.env` file
2. **Restart server** to pick up API key
3. **Open Swagger**: http://localhost:3001/api/docs
4. **Test analyze endpoint** with example queries
5. **Share Swagger URL** with frontend team

---

## 🎉 Summary

**Swagger Added**: ✅  
**Endpoints Documented**: ✅  
**Interactive Testing**: ✅  
**Request/Response Schemas**: ✅  
**Ready for Frontend Team**: ✅

**Access Swagger Now**: http://localhost:3001/api/docs
