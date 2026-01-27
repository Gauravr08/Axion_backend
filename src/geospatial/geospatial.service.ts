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
import { DatabaseService } from "../database/database.service";
import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import * as path from "path";
import {
  OpenRouterError,
  McpConnectionError,
  ToolExecutionError,
  TimeoutError,
  RateLimitError,
} from "../errors/app-errors";

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
  private axiosInstance: AxiosInstance;

  // Timeout configurations
  private readonly OPENROUTER_TIMEOUT = 60000; // 60 seconds
  private readonly ANALYSIS_TIMEOUT = 90000; // 90 seconds
  private readonly MCP_HEALTH_TIMEOUT = 10000; // 10 seconds

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
  ) {
    this.openRouterApiKey =
      this.configService.get<string>("OPENROUTER_API_KEY");
    this.openRouterModel =
      this.configService.get<string>("OPENROUTER_MODEL") ||
      "x-ai/grok-4.1-fast";
    this.mcpMode = (this.configService.get<string>("MCP_MODE") ||
      "remote") as MCPMode;

    // Create axios instance with retry logic
    this.axiosInstance = axios.create({
      timeout: this.OPENROUTER_TIMEOUT,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Configure axios retry
    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        // Retry on network errors and 5xx errors
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 || // Rate limit
          error.response?.status === 503 || // Service unavailable
          (error.response?.status >= 500 && error.response?.status < 600)
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        this.logger.warn(
          `Retry attempt ${retryCount} for ${requestConfig.url}: ${error.message}`,
        );
      },
    });
  }

  async onModuleInit() {
    this.logger.log("🔄 Initializing Geospatial Service...");
    this.logger.log(`📡 MCP Mode: ${this.mcpMode.toUpperCase()}`);

    if (
      !this.openRouterApiKey ||
      this.openRouterApiKey === "your_openrouter_api_key_here" ||
      this.openRouterApiKey === "sk-or-v1-your-key-here"
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
      try {
        await this.mcpClient.close();
      } catch (error) {
        this.logger.error(`Error closing MCP client: ${error.message}`);
      }
    }
  }

  private async connectToRemoteMcp() {
    const remoteUrl = this.configService.get<string>("MCP_REMOTE_URL");
    const apiKey = this.configService.get<string>("MCP_API_KEY");

    if (!remoteUrl) {
      throw new McpConnectionError(
        "MCP_REMOTE_URL not configured in .env file",
      );
    }

    this.logger.log(`📡 Connecting to remote MCP at: ${remoteUrl}`);

    // Test if the remote server is accessible
    try {
      const healthCheck = await axios.get(`${remoteUrl}/health`, {
        timeout: this.MCP_HEALTH_TIMEOUT,
      });
      this.logger.log(
        `✅ Remote MCP health check passed: ${healthCheck.data.status}`,
      );
      this.logger.log(`📦 Available tools: ${healthCheck.data.tools}`);
    } catch (error) {
      throw new McpConnectionError(
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
      throw new McpConnectionError(
        "MCP_SERVER_PATH not configured in .env file",
      );
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

  async analyzeQuery(
    query: string,
    metadata?: {
      apiKeyId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    this.logger.log({
      message: "Analysis started",
      requestId,
      query: query.substring(0, 100) + (query.length > 100 ? "..." : ""),
      mcpMode: this.currentMode,
    });

    // Validate MCP connection
    if (!this.mcpConnected) {
      const error = new McpConnectionError(
        "MCP server not connected. Please check configuration.",
      );

      // Track failed request
      await this.trackUsageAsync({
        apiKeyId: metadata?.apiKeyId,
        endpoint: "/api/geospatial/analyze",
        query,
        mcpMode: this.currentMode,
        responseTime: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        requestId,
      });

      throw error;
    }

    // Validate API key
    if (
      !this.openRouterApiKey ||
      this.openRouterApiKey === "your_openrouter_api_key_here" ||
      this.openRouterApiKey === "sk-or-v1-your-key-here"
    ) {
      const error = new OpenRouterError(
        "OpenRouter API key not configured. Please set OPENROUTER_API_KEY in .env file",
      );

      // Track failed request
      await this.trackUsageAsync({
        apiKeyId: metadata?.apiKeyId,
        endpoint: "/api/geospatial/analyze",
        query,
        mcpMode: this.currentMode,
        responseTime: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        requestId,
      });

      throw error;
    }

    let toolUsed: string | undefined;
    let tokensUsed: number | undefined;
    let cost: number | undefined;

    try {
      // Wrap analysis in timeout
      const result = await this.withTimeout(
        this.performAnalysis(query, requestId),
        this.ANALYSIS_TIMEOUT,
        `Analysis timed out after ${this.ANALYSIS_TIMEOUT}ms`,
      );

      const duration = Date.now() - startTime;

      // Extract metadata from result
      if (result.tool?.name) {
        toolUsed = result.tool.name;
      }

      // Estimate tokens (rough estimate: 1 token ≈ 4 chars)
      tokensUsed = Math.ceil(
        (query.length + JSON.stringify(result).length) / 4,
      );

      // Estimate cost (Grok pricing: ~$0.50 per 1M tokens)
      cost = (tokensUsed / 1000000) * 0.5;

      this.logger.log({
        message: "Analysis completed",
        requestId,
        duration: `${duration}ms`,
        success: true,
        toolUsed,
        tokensUsed,
        cost,
      });

      // Track successful request (fire-and-forget)
      await this.trackUsageAsync({
        apiKeyId: metadata?.apiKeyId,
        endpoint: "/api/geospatial/analyze",
        query,
        mcpMode: this.currentMode,
        toolUsed,
        responseTime: duration,
        success: true,
        tokensUsed,
        cost,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        requestId,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error({
        message: "Analysis failed",
        requestId,
        duration: `${duration}ms`,
        error: error.message,
        errorType: error.constructor.name,
      });

      // Track failed request (fire-and-forget)
      await this.trackUsageAsync({
        apiKeyId: metadata?.apiKeyId,
        endpoint: "/api/geospatial/analyze",
        query,
        mcpMode: this.currentMode,
        toolUsed,
        responseTime: duration,
        success: false,
        errorMessage: error.message,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        requestId,
      });

      throw this.handleAnalysisError(error);
    }
  }

  /**
   * Track API usage asynchronously (fire-and-forget to not block requests)
   */
  private async trackUsageAsync(data: {
    apiKeyId?: string;
    endpoint: string;
    query?: string;
    mcpMode?: string;
    toolUsed?: string;
    responseTime?: number;
    success: boolean;
    errorMessage?: string;
    tokensUsed?: number;
    cost?: number;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<void> {
    // Fire-and-forget: don't await, don't let failures propagate
    this.databaseService.trackUsage(data).catch((error) => {
      this.logger.warn(`Failed to track usage: ${error.message}`);
    });
  }

  private async performAnalysis(query: string, requestId: string) {
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

      this.logger.log({
        message: "Sending to OpenRouter",
        requestId,
        model: this.openRouterModel,
        toolCount: openRouterTools.length,
      });

      // Send query to OpenRouter with MCP tools
      const response = await this.axiosInstance.post(
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
            "HTTP-Referer":
              this.configService.get<string>("APP_URL") ||
              "http://localhost:3001",
            "X-Title": "Axion Geospatial Backend",
          },
        },
      );

      const message = response.data.choices[0].message;
      this.logger.log({
        message: "OpenRouter response received",
        requestId,
        hasToolCalls: !!message.tool_calls,
      });

      // Handle tool calls if LLM requests them
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        this.logger.log({
          message: "Executing tool",
          requestId,
          tool: toolCall.function.name,
        });

        // Call MCP tool with error handling
        const toolResult = await this.executeToolWithRetry(
          toolCall.function.name,
          toolCall.function.arguments,
          requestId,
        );

        this.logger.log({
          message: "Tool executed successfully",
          requestId,
          tool: toolCall.function.name,
        });

        // Send tool result back to OpenRouter for final response
        const finalResponse = await this.axiosInstance.post(
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
              "HTTP-Referer":
                this.configService.get<string>("APP_URL") ||
                "http://localhost:3001",
              "X-Title": "Axion Geospatial Backend",
            },
          },
        );

        return this.formatResponse(
          finalResponse.data.choices[0].message,
          toolResult,
          toolCall.function.name,
        );
      }

      // No tool calls - return direct response
      return {
        success: true,
        response: message.content,
        data: null,
        visualizationUrl: null,
        mapUrl: null,
        mcpMode: this.currentMode,
        tool: undefined,
      };
    } catch (error) {
      throw this.handleAnalysisError(error);
    }
  }

  private async executeToolWithRetry(
    toolName: string,
    argumentsJson: string,
    requestId: string,
    maxRetries: number = 2,
  ) {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const args = JSON.parse(argumentsJson);

        this.logger.log({
          message: `Tool execution attempt ${attempt + 1}/${maxRetries + 1}`,
          requestId,
          tool: toolName,
        });

        const result = await this.mcpClient.callTool({
          name: toolName,
          arguments: args,
        });

        // Validate result
        if (!result || !result.content) {
          throw new ToolExecutionError("Tool returned empty result", toolName);
        }

        return result;
      } catch (error) {
        lastError = error;
        this.logger.warn({
          message: `Tool execution attempt ${attempt + 1} failed`,
          requestId,
          tool: toolName,
          error: error.message,
        });

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await this.sleep(delay);
        }
      }
    }

    throw new ToolExecutionError(
      `Tool execution failed after ${maxRetries + 1} attempts: ${lastError.message}`,
      toolName,
    );
  }

  private formatResponse(message: any, toolResult: any, toolName?: string) {
    // Extract visualization URL from tool result if present
    let visualizationUrl = null;
    let mapUrl = null;

    if (toolResult && toolResult.content) {
      for (const item of toolResult.content) {
        if (item.type === "text") {
          try {
            const parsed = JSON.parse(item.text);
            if (parsed.visualizationUrl) {
              visualizationUrl = parsed.visualizationUrl;
            }
            if (parsed.mapUrl) {
              mapUrl = parsed.mapUrl;
            }
            if (parsed.url) {
              mapUrl = parsed.url;
            }
          } catch (e) {
            // Not JSON, check for URLs in text
            const urlMatch = item.text.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
              visualizationUrl = urlMatch[0];
            }
          }
        }
      }
    }

    // Parse tool result data
    let data = null;
    try {
      if (toolResult.content && toolResult.content[0]?.text) {
        data = JSON.parse(toolResult.content[0].text);
      }
    } catch (e) {
      data = toolResult.content;
    }

    return {
      success: true,
      response: message.content,
      data,
      visualizationUrl,
      mapUrl,
      mcpMode: this.currentMode,
      tool: toolName ? { name: toolName } : undefined,
    };
  }

  private handleAnalysisError(error: any): Error {
    // Already a custom error, re-throw
    if (
      error instanceof OpenRouterError ||
      error instanceof McpConnectionError ||
      error instanceof ToolExecutionError ||
      error instanceof TimeoutError ||
      error instanceof RateLimitError
    ) {
      return error;
    }

    // Axios error
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.message;

      if (status === 401) {
        return new OpenRouterError("OpenRouter API authentication failed");
      }
      if (status === 429) {
        const retryAfter = error.response.headers["retry-after"];
        return new RateLimitError(
          "OpenRouter rate limit exceeded. Please try again later.",
          retryAfter ? parseInt(retryAfter) : undefined,
        );
      }
      if (status >= 500) {
        return new OpenRouterError(`OpenRouter service error: ${message}`);
      }
    }

    // Timeout error
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      return new TimeoutError("Request timed out. Please try a simpler query.");
    }

    // Network error
    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return new OpenRouterError("Unable to reach OpenRouter API");
    }

    // Generic error
    return new Error(
      process.env.NODE_ENV === "production"
        ? "Analysis failed. Please try again."
        : error.message,
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new TimeoutError(timeoutMessage, timeoutMs)),
          timeoutMs,
        ),
      ),
    ]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
