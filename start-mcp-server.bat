@echo off
echo ====================================
echo Starting Axion Planetary MCP Server
echo ====================================
cd axion-planetary-mcp
echo Starting SSE server on port 3000...
npm run dev:sse
