# Quick Test Script for Axion Backend

Write-Host "`n🔍 Testing Axion Backend API`n" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "1️⃣  Testing health endpoint..." -ForegroundColor Yellow
$healthResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/geospatial/health" -Method POST -ContentType "application/json"
Write-Host "✅ Health Check: $($healthResponse | ConvertTo-Json -Depth 5)`n" -ForegroundColor Green

# Test 2: Simple Query
Write-Host "2️⃣  Testing analyze endpoint with simple query..." -ForegroundColor Yellow
$query1 = @{ query = "Show me NDVI for Iowa farmland" } | ConvertTo-Json
$response1 = Invoke-RestMethod -Uri "http://localhost:3000/api/geospatial/analyze" -Method POST -Body $query1 -ContentType "application/json"
Write-Host "✅ Response: $($response1.response)`n" -ForegroundColor Green
Write-Host "📊 Data: $($response1.data | ConvertTo-Json -Depth 5)`n" -ForegroundColor Cyan

# Test 3: Coordinate-based Query
Write-Host "3️⃣  Testing with coordinates..." -ForegroundColor Yellow
$query2 = @{ query = "Analyze this location for residential development: 18.52°N, 73.85°E" } | ConvertTo-Json
$response2 = Invoke-RestMethod -Uri "http://localhost:3000/api/geospatial/analyze" -Method POST -Body $query2 -ContentType "application/json"
Write-Host "✅ Response: $($response2.response)`n" -ForegroundColor Green

Write-Host "✨ All tests completed!`n" -ForegroundColor Magenta
