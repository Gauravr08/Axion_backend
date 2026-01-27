# Axion Backend - Geospatial MCP Server

![NestJS](https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![OpenRouter](https://img.shields.io/badge/openrouter-API-blue?style=for-the-badge)
![MCP](https://img.shields.io/badge/MCP-Server-green?style=for-the-badge)

A powerful NestJS backend that combines geospatial analysis with AI through the Model Context Protocol (MCP) and OpenRouter integration. Built for analyzing satellite imagery, vegetation health indices, and real estate development suitability.

## 🚀 Features

### Core Capabilities

- **🌍 Geospatial Analysis**: Satellite imagery processing using STAC API
- **🌱 Vegetation Indices**: NDVI, NDBI, NDWI calculations from Sentinel-2 and Landsat data
- **🏘️ Real Estate Analytics**: Site suitability analysis for development projects
- **🤖 AI Integration**: Natural language querying via OpenRouter models
- **🔧 MCP Server**: Model Context Protocol for AI tool execution
- **📊 REST API**: Well-documented endpoints with Swagger UI

### Supported Analysis Types

- **Site Analysis**: Comprehensive development suitability evaluation
- **Growth Trends**: Urban expansion analysis using historical satellite data
- **Terrain Analysis**: Slope and aspect calculations for feasibility studies
- **Proximity Analysis**: Distance calculations to amenities and infrastructure
- **Vegetation Health**: NDVI monitoring for agricultural and environmental assessment

## 🌍 Overview

Axion Backend is a comprehensive geospatial analysis platform that combines:

- **Satellite imagery analysis** with vegetation, urban, and water indices
- **Natural language query processing** via OpenRouter AI models
- **Model Context Protocol (MCP) dual-mode architecture** (remote + local with automatic fallback)
- **RESTful API** with comprehensive Swagger documentation

### Architecture

```
User → NestJS REST API → MCP Client (Dual Mode) → OpenRouter AI
                              ↓
                    ┌─────────┴─────────┐
                    │                   │
              Remote MCP          Local MCP
           (7 powerful tools)   (1 basic tool)
                    │                   │
              ✓ Primary Mode      ✓ Fallback Mode
```

**Dual-Mode MCP Connection:**

- **Primary**: Connects to production-grade `axion-planetary-mcp` hosted at Render (7 tools)
- **Fallback**: Automatically switches to local MCP server if remote fails (1 tool)
- **SDK Version**: 1.25.3 (latest) with SSE transport support

### Geospatial Analysis

- **NDVI (Normalized Difference Vegetation Index)** - Vegetation health assessment
- **NDBI (Normalized Difference Built-up Index)** - Urban development analysis
- **NDWI (Normalized Difference Water Index)** - Water body detection
- **EVI, SAVI, MNDWI, NDSI, NBR** - Advanced spectral indices (remote mode)
- **ML Classification** - Random Forest land cover classification (remote mode)
- **Site suitability assessment** for various applications

### AI-Powered Queries

- Natural language processing for geospatial queries
- Integration with multiple AI models via OpenRouter:
  - Anthropic Claude 3.5 Sonnet
  - OpenAI GPT-4 Turbo
  - X.AI Grok
  - Google Gemini Pro

### MCP Server Capabilities

**Remote Mode (7 Tools):**

- `axion_data` - STAC API data access, search, and filtering
- `axion_map` - Interactive map generation with multi-layer support
- `axion_process` - Image processing with 9 spectral indices
- `axion_classification` - ML-based land cover classification
- `axion_export` - Multi-format export (GeoTIFF, COG, PNG, KML, etc.)
- `axion_system` - Health checks and system utilities
- `axion_sar2optical` - SAR to optical image conversion

**Local Mode (1 Tool):**

- `axion_realestate` - Basic real estate site analysis

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **OpenRouter API key** for AI model access

## 🛠️ Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Edit `.env` file and configure your API keys and MCP mode:

```env
# OpenRouter API Configuration
OPENROUTER_API_KEY=your_actual_openrouter_api_key
OPENROUTER_MODEL=x-ai/grok-4.1-fast

# MCP Connection Mode: 'remote' or 'local'
MCP_MODE=remote

# Remote MCP Configuration (axion-planetary-mcp - 7 powerful tools)
MCP_REMOTE_URL=https://axion-mcp-sse.onrender.com
# Optional: API key for remote MCP (if authentication required)
# MCP_API_KEY=your_mcp_api_key_here

# Local MCP Configuration (fallback - 1 basic tool)
MCP_SERVER_PATH=dist/mcp/mcp-server.js

# Server Configuration
PORT=3001
NODE_ENV=development
```

**MCP Modes:**

- **`remote`** (recommended): Connects to the production-grade axion-planetary-mcp server with 7 sophisticated tools:
  - `axion_data` - STAC data access & search
  - `axion_map` - Interactive Leaflet map generation
  - `axion_process` - Advanced image processing (NDVI, EVI, NDWI, SAVI, NDBI, etc.)
  - `axion_classification` - ML land cover classification with Random Forest
  - `axion_export` - Multi-format data export (GeoTIFF, COG, PNG, Shapefile, KML)
  - `axion_system` - System health checks
  - `axion_sar2optical` - SAR to optical conversion (hosted only)

- **`local`**: Uses the basic local MCP server with 1 tool:
  - `axion_realestate` - Basic real estate analysis

**Automatic Fallback:** If remote connection fails (e.g., network issues, authentication), the system automatically falls back to local MCP mode.

Get your OpenRouter API key from: https://openrouter.ai/keys

### 3. Start the Backend

```bash
npm run start:dev
```

The server will start on http://localhost:3001

## � API Documentation

Once the server is running, access the interactive Swagger documentation at:

```
http://localhost:3001/api/docs
```

## 📡 API Endpoints

### POST `/api/geospatial/analyze`

Analyze geospatial queries using natural language processing.

**Request:**

```json
{
  "query": "Show me NDVI vegetation health for Iowa farmland"
}
```

**Response:**

```json
{
  "success": true,
  "response": "The Iowa farmland shows healthy vegetation with an NDVI of 0.72...",
  "data": {
    "ndvi": 0.72,
    "ndbi": 0.15,
    "ndwi": 0.45,
    "suitability_score": 0.85
  }
}
```

## 🧪 Testing & Usage

### Quick Test with PowerShell

```powershell
.\test-api.ps1
```

### Example Queries You Can Try

```javascript
// Example API requests
const queries = [
  "Show me NDVI vegetation health for Iowa farmland",
  "Analyze urban growth trends in downtown Austin",
  "Evaluate site suitability for residential development in Miami",
  "Calculate water body indices for Lake Tahoe",
  "Find optimal locations for solar farms in Nevada",
];
```

### Using curl

```bash
# Basic vegetation analysis
curl -X POST http://localhost:3001/geospatial/analyze \
  -H "Content-Type: application/json" \
  -d '{"query":"Show me NDVI for Iowa farmland"}'

# Site suitability analysis
curl -X POST http://localhost:3001/geospatial/analyze \
  -H "Content-Type: application/json" \
  -d '{"query":"Analyze this location for residential development: Austin, Texas"}'
```

### Using JavaScript/Fetch

```javascript
fetch("http://localhost:3001/geospatial/analyze", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: "Show me NDVI vegetation health for Iowa farmland",
  }),
})
  .then((response) => response.json())
  .then((data) => console.log(data));
```

## 🏗️ Project Structure

```
src/
├── main.ts                    # Application entry point & Swagger setup
├── app.module.ts             # Root application module
├── geospatial/               # Geospatial analysis module
│   ├── geospatial.controller.ts  # REST API endpoints
│   ├── geospatial.service.ts     # Business logic
│   ├── geospatial.module.ts      # Module configuration
│   └── dto/
│       └── analyze.dto.ts    # Data transfer objects
└── mcp/                      # Model Context Protocol server
    ├── mcp-server.ts        # MCP server implementation
    ├── lib/
    │   ├── registry.ts      # Tool registry system
    │   └── stac-client.ts   # STAC client integration
    └── tools/
        └── axion_realestate.ts # Real estate analysis tools
```

## 🔧 Available Scripts

- `npm run build` - Build the application for production
- `npm run start` - Start the application
- `npm run start:dev` - Start in development mode with file watching
- `npm run start:debug` - Start in debug mode
- `npm run start:prod` - Start the built application in production
- `npm run format` - Format code with Prettier
- `npm run lint` - Lint and fix code with ESLint

## ⚙️ Configuration

### Environment Variables

- `OPENROUTER_API_KEY`: Your OpenRouter API key (required)
- `OPENROUTER_MODEL`: AI model to use (default: x-ai/grok-4.1-fast)
- `MCP_SERVER_PATH`: Path to compiled MCP server (default: dist/mcp/mcp-server.js)
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment mode (development/production)

### Supported OpenRouter Models

- `x-ai/grok-4.1-fast` (default - fast inference)
- `anthropic/claude-3.5-sonnet` (advanced reasoning)
- `openai/gpt-4-turbo` (high performance)
- `x-ai/grok-beta` (experimental)
- `google/gemini-pro` (Google's advanced model)

### CORS Configuration

The application accepts requests from:

- `http://localhost:3001` (API server)
- `http://localhost:3000` (Frontend development)

## 🛠️ Key Dependencies

- **@nestjs/core** - NestJS framework core
- **@nestjs/swagger** - API documentation generation
- **@modelcontextprotocol/sdk** - MCP server implementation
- **axios** - HTTP client for external API calls
- **zod** - Schema validation and type safety
- **reflect-metadata** - Metadata reflection for decorators

## 🐛 Troubleshooting

### "OpenRouter API key not configured"

1. Get API key from https://openrouter.ai/keys
2. Add to `.env`: `OPENROUTER_API_KEY=sk-or-v1-...`
3. Restart server: `npm run start:dev`

### "Analysis failed"

1. Check console logs for detailed error messages
2. Verify OpenRouter API key is valid and has sufficient credits
3. Try a simpler query: "Show NDVI for Iowa"
4. Check network connectivity and firewall settings

### Port conflicts

1. Change port in `.env`: `PORT=3002`
2. Update frontend configuration to match
3. Restart the server

## 📚 API Documentation for Frontend Teams

**Base URL**: `http://localhost:3001` (development)

**Primary Endpoint**: `POST /api/geospatial/analyze`

**Request Schema**:

```typescript
interface AnalyzeRequest {
  query: string; // Natural language geospatial question
}
```

**Response Schema**:

```typescript
interface AnalyzeResponse {
  success: boolean;
  response: string; // Natural language answer
  data?: {
    // Structured data (optional)
    ndvi?: number; // Vegetation index (-1 to 1)
    ndbi?: number; // Built-up index (-1 to 1)
    ndwi?: number; // Water index (-1 to 1)
    ndmi?: number; // Moisture index (-1 to 1)
    suitability_score?: number; // Overall suitability (0-1)
    recommendations?: string[]; // AI recommendations
  };
  error?: string; // Error message if success=false
}
```

## � MCP Tools & Features

### Real Estate Analysis (`axion_realestate`)

The integrated MCP server provides comprehensive real estate analysis:

- **site_analysis**: Complete development suitability evaluation
- **growth_trends**: Urban expansion analysis using historical satellite data
- **proximity**: Distance calculations to amenities and infrastructure
- **terrain_analysis**: Slope and aspect analysis for development feasibility
- **help**: Detailed tool usage instructions

### STAC API Integration

- **Sentinel-2**: High-resolution optical imagery
- **Landsat**: Long-term historical data
- **NAIP**: High-resolution aerial imagery (US only)

## 🛠️ Advanced Development

### Available Scripts

- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run start:dev` - Development with hot reload
- `npm run start:debug` - Debug mode on port 9229
- `npm run format` - Code formatting with Prettier
- `npm run lint` - ESLint analysis and fixes

### Development Workflow

1. Make changes in `src/` directory
2. Hot reload automatically updates the server
3. Check console for TypeScript compilation errors
4. Test endpoints via Swagger UI at `/api/docs`
5. Use PowerShell test script for automated testing

### TypeScript Configuration

- Strict type checking enabled
- ES2022 target with Node.js compatibility
- Path mapping for clean imports
- Decorator support for NestJS

## 📚 Documentation & Resources

### Internal Documentation

- [Complete Setup Guide](SETUP_COMPLETE.md) - Step-by-step installation
- [Swagger Integration Guide](SWAGGER_SETUP.md) - API documentation setup
- [Interactive API Docs](http://localhost:3001/api/docs) - Live Swagger UI

### External References

- [OpenRouter API Docs](https://openrouter.ai/docs) - AI model integration
- [Model Context Protocol](https://github.com/modelcontextprotocol/specification) - MCP spec
- [STAC Specification](https://stacspec.org/) - Satellite data catalogs
- [NestJS Documentation](https://docs.nestjs.com/) - Framework guide

## 🚀 Production Deployment

### Build for Production

```bash
npm run build
npm run start:prod
```

### Production Environment Variables

```env
NODE_ENV=production
PORT=3001
OPENROUTER_API_KEY=your_production_key
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
MCP_SERVER_PATH=dist/mcp/mcp-server.js
```

### Deployment Checklist

- [ ] Set all environment variables
- [ ] Update CORS origins for production domains
- [ ] Configure SSL/HTTPS certificates
- [ ] Set up application monitoring
- [ ] Configure log management
- [ ] Test API endpoints in production

### Docker Support (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3001
CMD ["npm", "run", "start:prod"]
```

## 🔒 Security Considerations

### Implemented Security Features

- **CORS Protection**: Origin allowlisting for cross-origin requests
- **Input Validation**: DTO validation with class-validator decorators
- **Environment Variables**: Secure API key management
- **Error Handling**: Sanitized error responses
- **TypeScript**: Compile-time type safety

### Production Security Checklist

- [ ] Use HTTPS in production
- [ ] Rotate OpenRouter API keys regularly
- [ ] Implement rate limiting if needed
- [ ] Monitor API usage and costs
- [ ] Set up logging and alerting

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Clone your fork: `git clone <your-fork-url>`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature`
5. Make your changes following the coding standards
6. Test thoroughly using the provided scripts
7. Commit with descriptive messages
8. Push and create a Pull Request

### Code Quality Standards

- **TypeScript**: Strict typing throughout
- **ESLint**: Code quality enforcement
- **Prettier**: Consistent code formatting
- **JSDoc**: Document public APIs
- **Testing**: Add tests for new features

### Pull Request Guidelines

- Provide clear description of changes
- Include relevant test cases
- Update documentation if needed
- Ensure all checks pass
- Follow conventional commit messages

## 📊 Performance & Monitoring

### Key Metrics to Monitor

- **Response Times**: API endpoint performance
- **OpenRouter Usage**: Token consumption and costs
- **MCP Server Health**: Connection status and errors
- **Memory Usage**: Application resource consumption

### Performance Tips

- Cache frequently accessed data when appropriate
- Use appropriate OpenRouter models for the task
- Monitor satellite data API rate limits
- Implement request timeout handling

## 🆘 Support & Troubleshooting

### Getting Help

1. **Check Documentation**: Review setup guides and API docs
2. **Console Logs**: Examine server logs for detailed error info
3. **Test Scripts**: Use `test-api.ps1` for automated testing
4. **GitHub Issues**: Search existing issues or create new ones

### Common Error Solutions

- **500 Internal Server Error**: Check OpenRouter API key and model availability
- **CORS Errors**: Verify allowed origins in [main.ts](src/main.ts)
- **MCP Connection Failed**: Ensure build completed and path is correct
- **Port in Use**: Change `PORT` in `.env` or stop conflicting services

### Debug Information to Include

When reporting issues, please provide:

- Operating system and version
- Node.js version (`node --version`)
- npm version (`npm --version`)
- Complete error messages from console
- Steps to reproduce the issue
- Relevant environment variables (without sensitive values)

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for complete details.

## 🙋‍♂️ Final Notes

This backend serves as the foundation for geospatial applications requiring AI-powered natural language processing of satellite imagery data. The combination of NestJS's robust architecture, OpenRouter's AI capabilities, and the extensible MCP server provides a powerful platform for building sophisticated geospatial analysis tools.

### Quick Reference

- 🌐 **API Docs**: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- 📝 **Setup**: [SETUP_COMPLETE.md](SETUP_COMPLETE.md)
- 🔧 **OpenRouter**: [https://openrouter.ai/](https://openrouter.ai/)
- 📊 **GitHub**: [Project Repository](.)

---

**Built with ❤️ using NestJS, TypeScript, OpenRouter AI, and Model Context Protocol**
