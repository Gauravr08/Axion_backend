import {
  Injectable,
  OnModuleInit,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import {
  OpenRouterError,
  ToolExecutionError,
  TimeoutError,
  RateLimitError,
} from "../errors/app-errors";
import { SatelliteProcessingService } from "../satellite-processing/satellite-processing.service";
import { JobQueueService } from "../jobs/job-queue.service";
import { SiteAnalysisDto, GrowthTrendsDto } from "../satellite-processing/dto/satellite-analysis.dto";

@Injectable()
export class GeospatialService implements OnModuleInit {
  private readonly logger = new Logger(GeospatialService.name);
  private openRouterApiKey: string;
  private openRouterModel: string;
  private axiosInstance: AxiosInstance;

  // Timeout configurations
  private readonly OPENROUTER_TIMEOUT = 60000; // 60 seconds
  private readonly ANALYSIS_TIMEOUT = 180000; // 180 seconds (3 minutes for COG processing)

  constructor(
    private configService: ConfigService,
    private satelliteService: SatelliteProcessingService,
    private jobQueue: JobQueueService,
  ) {
    this.openRouterApiKey =
      this.configService.get<string>("OPENROUTER_API_KEY");
    this.openRouterModel =
      this.configService.get<string>("OPENROUTER_MODEL") ||
      "x-ai/grok-4.1-fast";

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
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 ||
          error.response?.status === 503 ||
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
    this.logger.log("🚀 Initializing Geospatial Service (Custom Processing)...");
    this.logger.log("✅ No external MCP dependency - using direct STAC API access");

    if (
      !this.openRouterApiKey ||
      this.openRouterApiKey === "your_openrouter_api_key_here" ||
      this.openRouterApiKey === "sk-or-v1-your-key-here"
    ) {
      this.logger.warn(
        "⚠️  OpenRouter API key not configured. Set OPENROUTER_API_KEY in .env file",
      );
    }

    // Log queue statistics (non-blocking)
    try {
      const stats = await this.jobQueue.getQueueStats();
      if (stats) {
        this.logger.log(`📊 Queue Status: ${stats.status || 'operational'}`);
      }
    } catch (error) {
      this.logger.warn(`Queue stats unavailable: ${error.message}`);
    }
  }

  /**
   * Main analysis entry point
   */
  async analyzeQuery(query: string, requestId: string) {
    const startTime = Date.now();
    this.logger.log({
      message: "New analysis request",
      requestId,
      query: query.substring(0, 100),
    });

    // Validate API key
    if (
      !this.openRouterApiKey ||
      this.openRouterApiKey === "your_openrouter_api_key_here" ||
      this.openRouterApiKey === "sk-or-v1-your-key-here"
    ) {
      throw new OpenRouterError(
        "OpenRouter API key not configured. Please set OPENROUTER_API_KEY in .env file",
      );
    }

    try {
      const result = await this.withTimeout(
        this.performAnalysis(query, requestId),
        this.ANALYSIS_TIMEOUT,
        `Analysis timed out after ${this.ANALYSIS_TIMEOUT}ms`,
      );

      const duration = Date.now() - startTime;
      this.logger.log({
        message: "Analysis completed",
        requestId,
        duration: `${duration}ms`,
        success: true,
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

      throw this.handleAnalysisError(error);
    }
  }

  private async performAnalysis(query: string, requestId: string) {
    try {
      // Define available tools for OpenRouter
      const tools = this.getAvailableTools();

      this.logger.log({
        message: "Sending to OpenRouter",
        requestId,
        model: this.openRouterModel,
        toolCount: tools.length,
      });

      // Send query to OpenRouter with tools
      const response = await this.axiosInstance.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: this.openRouterModel,
          messages: [
            {
              role: "system",
              content:
                "You are a geospatial analysis assistant with access to satellite imagery tools. Use site_analysis for location analysis, growth_trends for temporal comparison. When users ask about vegetation, crops, or farmland, use site_analysis with 'agricultural' project type. For urban analysis, use 'residential', 'commercial', or 'industrial'. For water analysis, check NDWI values. Always interpret results in natural language.",
            },
            {
              role: "user",
              content: query,
            },
          ],
          tools: tools,
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

      // Handle tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        this.logger.log({
          message: "Executing tool",
          requestId,
          tool: toolCall.function.name,
        });

        // Execute tool directly using our satellite service
        const toolResult = await this.executeToolDirectly(
          toolCall.function.name,
          toolCall.function.arguments,
          requestId,
        );

        this.logger.log({
          message: "Tool executed successfully",
          requestId,
          tool: toolCall.function.name,
        });

        // Send tool result back to OpenRouter for interpretation
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
                content: JSON.stringify(toolResult),
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
        );
      }

      // No tool calls - return direct response
      return {
        success: true,
        response: message.content,
        data: null,
        visualizationUrl: null,
        mapUrl: null,
        processingMode: "custom",
      };
    } catch (error) {
      throw this.handleAnalysisError(error);
    }
  }

  /**
   * Execute tool directly without MCP
   */
  private async executeToolDirectly(
    toolName: string,
    argumentsJson: string,
    requestId: string,
  ) {
    try {
      const args = JSON.parse(argumentsJson);

      switch (toolName) {
        case "site_analysis":
          return await this.satelliteService.analyzeSite(args as SiteAnalysisDto);

        case "growth_trends":
          return await this.satelliteService.analyzeGrowthTrends(args as GrowthTrendsDto);

        default:
          throw new ToolExecutionError(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      this.logger.error(
        `Tool execution failed: ${toolName} - ${error.message}`,
        error.stack,
      );
      throw new ToolExecutionError(
        `Tool execution failed: ${error.message}`,
      );
    }
  }

  /**
   * Define available tools (replaces MCP tool list)
   */
  private getAvailableTools() {
    return [
      {
        type: "function",
        function: {
          name: "site_analysis",
          description:
            "Comprehensive site suitability analysis for real estate development using satellite imagery. Analyzes vegetation (NDVI), built-up areas (NDBI), water presence (NDWI), and soil moisture (NDMI).",
          parameters: {
            type: "object",
            properties: {
              bbox: {
                type: "array",
                items: { type: "number" },
                minItems: 4,
                maxItems: 4,
                description: "Bounding box as [west, south, east, north]",
              },
              latitude: {
                type: "number",
                minimum: -90,
                maximum: 90,
                description: "Center latitude (alternative to bbox)",
              },
              longitude: {
                type: "number",
                minimum: -180,
                maximum: 180,
                description: "Center longitude (alternative to bbox)",
              },
              radius: {
                type: "number",
                minimum: 100,
                default: 1000,
                description: "Search radius in meters (used with lat/lon)",
              },
              projectType: {
                type: "string",
                enum: [
                  "residential",
                  "commercial",
                  "industrial",
                  "mixed",
                  "agricultural",
                ],
                default: "residential",
                description: "Type of real estate development",
              },
              startDate: {
                type: "string",
                description: "Analysis start date (YYYY-MM-DD)",
              },
              endDate: {
                type: "string",
                description: "Analysis end date (YYYY-MM-DD)",
              },
              cloudCoverMax: {
                type: "number",
                minimum: 0,
                maximum: 100,
                default: 10,
                description: "Maximum acceptable cloud cover percentage",
              },
              includeVisualization: {
                type: "boolean",
                default: true,
                description: "Include TiTiler visualization URLs",
              },
            },
            required: [],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "growth_trends",
          description:
            "Analyze urban expansion and vegetation changes by comparing two time periods. Detects urbanization, deforestation, and land use changes.",
          parameters: {
            type: "object",
            properties: {
              bbox: {
                type: "array",
                items: { type: "number" },
                minItems: 4,
                maxItems: 4,
                description: "Bounding box as [west, south, east, north]",
              },
              baselineStart: {
                type: "string",
                description: "Baseline period start date (YYYY-MM-DD)",
              },
              baselineEnd: {
                type: "string",
                description: "Baseline period end date (YYYY-MM-DD)",
              },
              currentStart: {
                type: "string",
                description: "Current period start date (YYYY-MM-DD)",
              },
              currentEnd: {
                type: "string",
                description: "Current period end date (YYYY-MM-DD)",
              },
              cloudCoverMax: {
                type: "number",
                minimum: 0,
                maximum: 100,
                default: 10,
                description: "Maximum acceptable cloud cover percentage",
              },
            },
            required: [
              "bbox",
              "baselineStart",
              "baselineEnd",
              "currentStart",
              "currentEnd",
            ],
          },
        },
      },
    ];
  }

  private formatResponse(message: any, toolResult: any) {
    return {
      success: true,
      response: message.content,
      data: toolResult,
      visualizationUrl: toolResult.visualizationUrl || null,
      mapUrl: toolResult.mapUrl || null,
      processingMode: "custom",
    };
  }

  private handleAnalysisError(error: any) {
    if (error instanceof OpenRouterError) return error;
    if (error instanceof ToolExecutionError) return error;
    if (error instanceof TimeoutError) return error;

    if (error.response?.status === 429) {
      return new RateLimitError("OpenRouter API rate limit exceeded");
    }

    if (error.response?.status >= 500) {
      return new OpenRouterError(
        `OpenRouter service error: ${error.message}`,
      );
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return new TimeoutError("Request timeout");
    }

    return new Error(`Analysis failed: ${error.message}`);
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new TimeoutError(errorMessage));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutHandle);
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle);
      throw error;
    }
  }
}
