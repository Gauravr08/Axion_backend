@echo off
echo ====================================
echo Axion Backend - Complete Test Suite
echo ====================================
echo.

echo [Test 1/5] Checking if MCP Server is running...
curl -s http://localhost:3000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ MCP Server is ONLINE
    curl -s http://localhost:3000/health
) else (
    echo ✗ MCP Server is OFFLINE
    echo   Start it with: cd axion-planetary-mcp ^&^& npm run dev:sse
)
echo.

echo [Test 2/5] Checking if Backend API is running...
curl -s http://localhost:3001/api/geospatial/health -X POST -H "Content-Type: application/json" -d "{}" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Backend API is ONLINE
    curl -s http://localhost:3001/api/geospatial/health -X POST -H "Content-Type: application/json" -d "{}"
) else (
    echo ✗ Backend API is OFFLINE
    echo   Start it with: npm run start:dev
)
echo.

echo [Test 3/5] Testing simple query...
curl -s -X POST http://localhost:3001/api/geospatial/analyze ^
  -H "Content-Type: application/json" ^
  -d "{\"query\":\"What tools are available?\"}" ^
  >test-result.json 2>&1
if %errorlevel% equ 0 (
    echo ✓ Query test PASSED
    echo Response saved to: test-result.json
) else (
    echo ✗ Query test FAILED
)
echo.

echo [Test 4/5] Port Status...
netstat -ano | findstr ":3000 " | findstr "LISTENING"
netstat -ano | findstr ":3001 " | findstr "LISTENING"
echo.

echo [Test 5/5] MCP Connection Mode...
curl -s http://localhost:3001/api/geospatial/health -X POST -H "Content-Type: application/json" -d "{}" | findstr "mcpConnected"
echo.

echo ====================================
echo Test Complete!
echo ====================================
echo.
echo Access Points:
echo   MCP Server:  http://localhost:3000
echo   Backend API: http://localhost:3001
echo   Swagger:     http://localhost:3001/api/docs
echo.
pause
