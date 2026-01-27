# Axion Backend - Quick Start Guide

## 🚀 Starting the Servers

### Option 1: Automatic (Recommended)

Double-click or run:

```bash
start-all.bat
```

This will:

- Clean up any processes on ports 3000 and 3001
- Start MCP server in one window
- Start Backend API in another window

### Option 2: Manual (Two Terminals)

**Terminal 1 - Start MCP Server:**

```bash
cd axion-planetary-mcp
npm run dev:sse
```

Wait until you see: `✅ Tools: axion_data, axion_system, axion_process...`

**Terminal 2 - Start Backend API:**

```bash
npm run start:dev
```

Wait until you see: `✅ Remote MCP Server connected successfully`

---

## 🛑 Common Issues

### Issue: "Port already in use"

**Solution:** Run this first:

```bash
cleanup-ports.bat
```

### Issue: Backend can't connect to MCP

**Solution:** Make sure MCP server is running first (Terminal 1)

- Check: http://localhost:3000/health

### Issue: Wrong npm command

**Correct commands:**

- ✅ `npm run start:dev` (in axion-backend)
- ✅ `npm run dev:sse` (in axion-planetary-mcp)
- ❌ `npm start start:dev` (WRONG - this adds extra argument)

---

## 🧪 Testing

### Quick Test

```bash
test-servers.bat
```

### Test with Query

```bash
curl -X POST http://localhost:3001/api/geospatial/analyze ^
  -H "Content-Type: application/json" ^
  -d "{\"query\":\"Show NDVI for Iowa farmland\"}"
```

### PowerShell Version

```powershell
$body = @{query="Show NDVI for Iowa farmland"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/geospatial/analyze" `
  -Method Post -Body $body -ContentType "application/json"
```

---

## 📍 Access Points

- **Backend API:** http://localhost:3001
- **Swagger Docs:** http://localhost:3001/api/docs
- **MCP Server:** http://localhost:3000
- **MCP Health:** http://localhost:3000/health

---

## 🔧 Available Commands

### In axion-backend directory:

```bash
npm run start:dev    # Start in dev mode with watch
npm run build        # Build the application
npm run start        # Start production build
```

### In axion-planetary-mcp directory:

```bash
npm run dev:sse      # Start SSE server (for remote MCP)
npm run dev          # Start STDIO server (for local MCP)
```

---

## 🛠️ Configuration

Edit `.env` file to change MCP mode:

```env
# Use local MCP server (localhost:3000)
MCP_MODE=remote
MCP_REMOTE_URL=http://localhost:3000

# Use hosted MCP server (requires API key)
# MCP_MODE=remote
# MCP_REMOTE_URL=https://axion-mcp-sse.onrender.com
# MCP_API_KEY=your_api_key_here

# Use local fallback only
# MCP_MODE=local
```

---

## 📊 System Status

To check if everything is running:

```bash
# Check MCP Server
curl http://localhost:3000/health

# Check Backend API
curl -X POST http://localhost:3001/api/geospatial/health ^
  -H "Content-Type: application/json" -d "{}"
```

---

## 🎯 Tools Available

When connected to remote MCP (6-7 tools):

- `axion_data` - STAC satellite imagery search
- `axion_map` - Interactive Leaflet maps
- `axion_process` - Spectral indices (NDVI, EVI, NDWI, etc.)
- `axion_classification` - ML land cover classification
- `axion_export` - Multi-format data export
- `axion_system` - Health checks
- `axion_sar2optical` - SAR to optical conversion (hosted only)

When using local MCP fallback (1 tool):

- `axion_realestate` - Basic real estate analysis

---

## 🆘 Need Help?

1. Make sure both servers are running
2. Check the terminal output for errors
3. Run `cleanup-ports.bat` if ports are in use
4. Verify configuration in `.env` file
