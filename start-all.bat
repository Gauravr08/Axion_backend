@echo off
echo ====================================
echo Axion Backend - Full Stack Startup
echo ====================================
echo.

REM Clean up any existing processes on ports 3000 and 3001
echo [Step 0] Cleaning up ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)
timeout /t 1 >nul

echo.
echo This will start BOTH servers in separate windows:
echo 1. Axion Planetary MCP Server (port 3000) - 6-7 tools
echo 2. Axion Backend API (port 3001) - NestJS + OpenRouter
echo.
echo Press any key to start...
pause >nul

echo.
echo [1/2] Starting MCP SSE Server...
start "Axion MCP Server (Port 3000)" cmd /k "cd axion-planetary-mcp && npm run dev:sse"

echo [Waiting] 8 seconds for MCP server to initialize...
timeout /t 8 >nul

echo [2/2] Starting Backend API...
start "Axion Backend API (Port 3001)" cmd /k "npm run start:dev"

echo.
timeout /t 3 >nul
echo ====================================
echo Both servers are starting!
echo ====================================
echo.
echo Check the terminal windows for status.
echo.
echo Once started, you can access:
echo   MCP Server Info: http://localhost:3000
echo   MCP Health:      http://localhost:3000/health
echo   Backend API:     http://localhost:3001
echo   Swagger Docs:    http://localhost:3001/api/docs
echo.
echo To test:
echo   .\test-servers.bat
echo.
echo To stop servers:
echo   Close the terminal windows or use Ctrl+C in each
echo.
pause
