@echo off
echo ====================================
echo Starting Axion Backend API Server
echo ====================================
echo Starting NestJS server on port 3001...
echo.
echo Make sure the MCP server is running on port 3000!
echo If not, run start-mcp-server.bat in another terminal first.
echo.
timeout /t 2 >nul
npm run start:dev
