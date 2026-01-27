@echo off
echo ====================================
echo Testing Axion Backend Connections
echo ====================================
echo.

echo [1/3] Testing MCP Server (port 3000)...
curl -s http://localhost:3000/health
if %errorlevel% equ 0 (
    echo ✓ MCP Server is RUNNING
) else (
    echo ✗ MCP Server is NOT responding
)
echo.

echo [2/3] Testing Backend API (port 3001)...
curl -s http://localhost:3001/api/geospatial/health -X POST -H "Content-Type: application/json" -d "{}"
if %errorlevel% equ 0 (
    echo ✓ Backend API is RUNNING
) else (
    echo ✗ Backend API is NOT responding
)
echo.

echo [3/3] Checking process status...
netstat -ano | findstr ":3000 " | findstr "LISTENING"
netstat -ano | findstr ":3001 " | findstr "LISTENING"
echo.

echo ====================================
echo Test Complete
echo ====================================
pause
