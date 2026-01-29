#!/usr/bin/env node
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Import tool registry
import * as registry from "./lib/registry.js";

// Import all tools (they self-register)
import "./tools/axion_realestate.js";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.MCP_API_KEY || "development-key";
const NODE_ENV = process.env.NODE_ENV || "development";

// Middleware
app.use(express.json());

// API Key authentication middleware
const authenticate = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;

  // Skip auth in development if no API key is set
  if (NODE_ENV === "development" && API_KEY === "development-key") {
    return next();
  }

  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API key" });
  }

  next();
};

// Health check endpoint (no auth required)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "axion-mcp-server",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// List tools endpoint
app.get("/tools", authenticate, (req, res) => {
  try {
    const tools = registry.list();
    res.json({
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  } catch (error: any) {
    console.error("Error listing tools:", error);
    res
      .status(500)
      .json({ error: "Failed to list tools", message: error.message });
  }
});

// Call tool endpoint
app.post("/tools/:toolName", authenticate, async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  try {
    console.log(`Calling tool: ${toolName} with args:`, args);
    const result = await registry.call(toolName, args);
    res.json({ success: true, result });
  } catch (error: any) {
    console.error(`Error calling tool ${toolName}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      tool: toolName,
    });
  }
});

// Server-Sent Events endpoint for MCP protocol
app.get("/sse", authenticate, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Create MCP server for this connection
  const server = new Server(
    {
      name: "axion-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = registry.list();
    console.log("📋 Listing tools:", tools.map((t) => t.name).join(", "));
    return { tools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      console.log(`🔧 Calling tool: ${name}`);
      const result = await registry.call(name, args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error(`❌ Error calling tool ${name}:`, error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Send initial connection message
  res.write(
    `data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`,
  );

  // Handle client disconnect
  req.on("close", () => {
    console.log("🔌 Client disconnected from SSE");
  });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`: keepalive\n\n`);
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
  });
});

// CORS headers for all routes
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    res
      .status(500)
      .json({ error: "Internal server error", message: err.message });
  },
);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Axion MCP Server running on port ${PORT}`);
  console.log(`   Environment: ${NODE_ENV}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Tools endpoint: http://localhost:${PORT}/tools`);
  console.log(`   SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(
    `   Auth: ${API_KEY === "development-key" ? "Disabled (development)" : "Enabled"}`,
  );

  // List available tools
  const tools = registry.list();
  console.log(
    `   Available tools (${tools.length}):`,
    tools.map((t) => t.name).join(", "),
  );
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("📴 Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("📴 Received SIGINT, shutting down gracefully...");
  process.exit(0);
});
