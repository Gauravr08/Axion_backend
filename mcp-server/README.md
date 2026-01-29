# Axion MCP Server

Standalone Model Context Protocol (MCP) server for Axion geospatial analysis.

## Features

- **RESTful API**: Simple HTTP endpoints for tool execution
- **Server-Sent Events (SSE)**: MCP protocol support for real-time connections
- **Geospatial Tools**: Satellite imagery analysis via AWS STAC API
- **Authentication**: API key-based security
- **Health Monitoring**: Built-in health check endpoint

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run start:dev

# Build for production
npm run build

# Start production server
npm start
```

### Environment Variables

```bash
PORT=3000                    # Server port
NODE_ENV=production          # Environment
MCP_API_KEY=your-key-here   # API key for authentication
LOG_LEVEL=info              # Logging level
```

### Docker

```bash
# Build image
docker build -t axion-mcp-server .

# Run container
docker run -p 3000:3000 \
  -e MCP_API_KEY=your-key \
  axion-mcp-server
```

### Railway Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialize
railway login
railway init

# Set environment variables
railway variables set MCP_API_KEY=your-production-key
railway variables set NODE_ENV=production

# Deploy
railway up
```

## API Endpoints

### Health Check

```
GET /health
```

Returns service status and version.

### List Tools

```
GET /tools
Headers: X-API-Key: your-key
```

Returns available geospatial analysis tools.

### Execute Tool

```
POST /tools/:toolName
Headers: X-API-Key: your-key
Content-Type: application/json

Body: { ...tool parameters }
```

Executes a specific tool with provided parameters.

### MCP SSE Endpoint

```
GET /sse
Headers: X-API-Key: your-key
```

Server-Sent Events endpoint for MCP protocol connections.

## Available Tools

### axion_realestate

Real estate site suitability analysis using satellite imagery.

**Operations:**

- `site_analysis`: Comprehensive site evaluation
- `growth_trends`: Urban expansion analysis
- `proximity`: Distance to amenities (coming soon)
- `terrain_analysis`: Slope and aspect analysis (coming soon)

**Example:**

```json
{
  "operation": "site_analysis",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "radius": 2000,
  "projectType": "residential",
  "cloudCoverMax": 10
}
```

## Architecture

```
mcp-server/
├── src/
│   ├── server.ts              # Express server with SSE support
│   ├── lib/
│   │   ├── registry.ts        # Tool registration system
│   │   └── stac-client.ts     # STAC API client
│   └── tools/
│       └── axion_realestate.ts # Real estate analysis tool
├── dist/                      # Build output
├── Dockerfile                 # Multi-stage Docker build
├── package.json
└── tsconfig.json
```

## Security

- API key authentication required for all tool endpoints
- Development mode bypasses auth for testing
- CORS enabled for cross-origin requests
- Non-root user in Docker container
- Health check doesn't require authentication

## Monitoring

- Health check endpoint: `GET /health`
- Structured logging to stdout
- Docker health checks every 30s
- Graceful shutdown on SIGTERM/SIGINT

## License

MIT
