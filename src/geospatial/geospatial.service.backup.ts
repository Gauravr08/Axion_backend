import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "../mcp/lib/sse-client-transport";
import axios from "axios";
import * as path from "path";

type MCPMode = "remote" | "local";

@Injectable()
export class GeospatialService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GeospatialService.name);
  private mcpClient: Client;
  private mcpConnected = false;
  private mcpMode: MCPMode;
  private currentMode: "remote" | "local" | null = null;
  private openRouterApiKey: string;
  private openRouterModel: string;

  constructor(private configService: ConfigService) {
    this.openRouterApiKey =
      this.configService.get<string>("OPENROUTER_API_KEY");
    this.openRouterModel =
      this.configService.get<string>("OPENROUTER_MODEL") ||
      "anthropic/claude-3.5-sonnet";
    this.mcpMode = (this.configService.get<string>("MCP_MODE") ||
      "remote") as MCPMode;
  }

  async onModuleInit() {
    this.logger.log("🔄 Initializing Geospatial Service...");
    this.logger.log(`📡 MCP Mode: ${this.mcpMode.toUpperCase()}`);

    if (
      !this.openRouterApiKey ||
      this.openRouterApiKey === "your_openrouter_api_key_here"
    ) {
      this.logger.warn(
        "⚠️  OpenRouter API key not configured. Set OPENROUTER_API_KEY in .env file",
      );
    }

    try {
      if (this.mcpMode === "remote") {
        await this.connectToRemoteMcp();
      } else {
        await this.connectToLocalMcp();
      }
    } catch (error) {
      this.logger.error(
        `❌ Failed to connect to ${this.mcpMode} MCP: ${error.message}`,
      );

      // Fallback to local if remote fails
      if (this.mcpMode === "remote") {
        this.logger.warn("⚠️  Attempting fallback to local MCP...");
        try {
          await this.connectToLocalMcp();
        } catch (fallbackError) {
          this.logger.error(
            `❌ Local MCP fallback also failed: ${fallbackError.message}`,
          );
        }
      }
    }
  }

  async onModuleDestroy() {
    this.logger.log("🔌 Disconnecting MCP client...");
    if (this.mcpClient) {
      await this.mcpClient.close();
    }
  }

  private async connectToRemoteMcp() {
    const remoteUrl = this.configService.get<string>("MCP_REMOTE_URL");
    const apiKey = this.configService.get<string>("MCP_API_KEY");

    if (!remoteUrl) {
      throw new Error("MCP_REMOTE_URL not configured in .env file");
    }

    this.logger.log(`📡 Connecting to remote MCP at: ${remoteUrl}`);

    // Test if the remote server is accessible
    try {
      const healthCheck = await axios.get(`${remoteUrl}/health`, {
        timeout: 10000,
      });
      this.logger.log(
        `✅ Remote MCP health check passed: ${healthCheck.data.status}`,
      );
      this.logger.log(`📦 Available tools: ${healthCheck.data.tools}`);
    } catch (error) {
      throw new Error(
        `Remote MCP server unreachable at ${remoteUrl}: ${error.message}`,
      );
    }

    const transport = new SSEClientTransport({
      url: remoteUrl,
      apiKey: apiKey,
      timeout: 30000,
    });

    this.mcpClient = new Client(
      {
        name: "axion-backend",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await this.mcpClient.connect(transport);
    this.mcpConnected = true;
    this.currentMode = "remote";
    this.logger.log("✅ Remote MCP Server connected successfully");

    // List available tools
    const tools = await this.mcpClient.listTools();
    this.logger.log(
      `📋 Available MCP tools (${tools.tools.length}): ${tools.tools.map((t) => t.name).join(", ")}`,
    );
  }

  private async connectToLocalMcp() {
    const mcpServerPath = this.configService.get<string>("MCP_SERVER_PATH");

    if (!mcpServerPath) {
      throw new Error("MCP_SERVER_PATH not configured in .env file");
    }

    // Resolve path relative to project root
    const resolvedPath = path.isAbsolute(mcpServerPath)
      ? mcpServerPath
      : path.resolve(process.cwd(), mcpServerPath);

    this.logger.log(`📡 Connecting to local MCP server at: ${resolvedPath}`);

    const transport = new StdioClientTransport({
      command: "node",
      args: [resolvedPath],
    });

    this.mcpClient = new Client(
      {
        name: "axion-backend",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await this.mcpClient.connect(transport);
    this.mcpConnected = true;
    this.currentMode = "local";
    this.logger.log("✅ Local MCP Server connected successfully");

    // List available tools
    const tools = await this.mcpClient.listTools();
    this.logger.log(
      `📋 Available MCP tools (${tools.tools.length}): ${tools.tools.map((t) => t.name).join(", ")}`,
    );
  }

  isMcpConnected(): boolean {
    return this.mcpConnected;
  }

  getMcpMode(): "remote" | "local" | null {
    return this.currentMode;
  }

  async analyzeQuery(query: string) {
    if (!this.mcpConnected) {
      throw new Error("MCP server not connected. Please check configuration.");
    }

    if (
      !this.openRouterApiKey ||
      this.openRouterApiKey === "your_openrouter_api_key_here"
    ) {
      throw new Error(
        "OpenRouter API key not configured. Please set OPENROUTER_API_KEY in .env file",
      );
    }

    this.logger.log(`🔍 Analyzing query: "${query}"`);
    this.logger.log(`📡 Using ${this.currentMode?.toUpperCase()} MCP`);

    try {
      // Get available tools from MCP server
      const tools = await this.mcpClient.listTools();

      // Convert MCP tools to OpenRouter format
      const openRouterTools = tools.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));

      this.logger.log(
        `🤖 Sending query to OpenRouter (${this.openRouterModel})...`,
      );

      // Send query to OpenRouter with MCP tools
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: this.openRouterModel,
          messages: [
            {
              role: "system",
              content:
                "You are a geospatial analysis assistant with access to powerful satellite imagery tools. Use the available tools to analyze satellite imagery, calculate indices (NDVI, NDWI, NDBI, EVI, etc.), process images, create classifications, generate maps, and export data. When users ask about vegetation, crops, or farmland, use site_analysis with agricultural project type or use axion_process for spectral indices. For urban analysis, use residential/commercial project types or NDBI indices. For water analysis, use NDWI. Always interpret the results in natural language and explain what the data means.",
            },
            {
              role: "user",
              content: query,
            },
          ],
          tools: openRouterTools,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Axion Geospatial Backend",
            "Content-Type": "application/json",
          },
        },
      );

      const message = response.data.choices[0].message;
      this.logger.log(
        `📨 OpenRouter response: ${message.content ? "text" : "tool call"}`,
      );

      // Handle tool calls if LLM requests them
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        this.logger.log(`🔧 Tool called: ${toolCall.function.name}`);
        this.logger.log(`📝 Tool arguments: ${toolCall.function.arguments}`);

        // Call MCP tool
        const toolResult = await this.mcpClient.callTool({
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
        });

        this.logger.log(`✅ Tool result received`);

        // Send tool result back to OpenRouter for final response
        const finalResponse = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: this.openRouterModel,
            messages: [
              {
                role: "system",
                content:
                  "You are a geospatial analysis assistant. Interpret the tool results and provide a clear, natural language explanation of the findings.",
              },
              {
                role: "user",
                content: query,
              },
              message,
              {
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(toolResult.content),
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${this.openRouterApiKey}`,
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "Axion Geospatial Backend",
              "Content-Type": "application/json",
            },
          },
        );

        return this.formatResponse(
          finalResponse.data.choices[0].message,
          toolResult,
        );
      }

      // Return direct response if no tool calls
      return {
        success: true,
        response: message.content || "Analysis complete",
        data: null,
        visualizationUrl: null,
        mcpMode: this.currentMode,
      };
    } catch (error) {
      this.logger.error(`❌ Analysis failed: ${error.message}`);

      if (error.response) {
        this.logger.error(
          `OpenRouter API Error: ${JSON.stringify(error.response.data)}`,
        );
        throw new Error(
          `OpenRouter API error: ${error.response.data.error?.message || error.message}`,
        );
      }

      throw new Error(`Analysis failed: ${error.message}`);
    }
  }

  private formatResponse(llmResponse: any, toolResult: any) {
    let parsedData = null;
    let visualizationUrl = null;
    let mapUrl = null;

    if (toolResult && toolResult.content && toolResult.content.length > 0) {
      try {
        const resultText = toolResult.content[0].text;
        parsedData = JSON.parse(resultText);

        // Extract visualization URLs (TiTiler, map URLs, etc.)
        const urlMatches = resultText.match(/https?:\/\/[^\s"]+/g);
        if (urlMatches) {
          // Look for specific URL types
          const titilerUrl = urlMatches.find((url) => url.includes("titiler"));
          const mapUrlMatch = urlMatches.find(
            (url) => url.includes("/map/") || url.includes("/classification/"),
          );

          if (titilerUrl) {
            visualizationUrl = titilerUrl;
          }
          if (mapUrlMatch) {
            mapUrl = mapUrlMatch;
          }
        }
      } catch (e) {
        this.logger.warn("Could not parse tool result as JSON");
      }
    }

    return {
      success: true,
      response: llmResponse.content || "Analysis complete",
      data: parsedData,
      visualizationUrl: visualizationUrl,
      mapUrl: mapUrl,
      mcpMode: this.currentMode,
    };
  }
}
