import {
  Controller,
  Post,
  Get,
  Body,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  Query,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiSecurity,
  ApiQuery,
} from "@nestjs/swagger";
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import { GeospatialService } from "./geospatial.service";
import { DatabaseService } from "../database/database.service";
import { AnalyzeDto } from "./dto/analyze.dto";
import { Public } from "../decorators/public.decorator";
import { Request } from "express";
import {
  OpenRouterError,
  McpConnectionError,
  ToolExecutionError,
  TimeoutError,
  RateLimitError,
} from "../errors/app-errors";

@ApiTags("Geospatial Analysis")
@ApiSecurity("api-key")
@Controller("api/geospatial")
export class GeospatialController {
  private readonly logger = new Logger(GeospatialController.name);

  constructor(
    private readonly geospatialService: GeospatialService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Post("analyze")
  @Throttle({ strict: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @ApiOperation({
    summary: "Analyze geospatial query",
    description:
      "Process natural language queries for satellite imagery analysis, vegetation indices (NDVI), urban indices (NDBI), water indices (NDWI), and site suitability assessment. Requires API key authentication.",
  })
  @ApiBody({ type: AnalyzeDto })
  @ApiResponse({
    status: 200,
    description: "Analysis successful",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        response: {
          type: "string",
          example:
            "The Iowa farmland shows healthy vegetation with an NDVI of 0.72...",
        },
        data: {
          type: "object",
          properties: {
            ndvi: { type: "number", example: 0.72 },
            ndbi: { type: "number", example: 0.15 },
            ndwi: { type: "number", example: 0.45 },
            suitabilityScore: { type: "number", example: 85 },
          },
        },
        visualizationUrl: {
          type: "string",
          example: "https://titiler.xyz/...",
        },
        mcpMode: { type: "string", example: "remote" },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Bad request - invalid input" })
  @ApiResponse({ status: 401, description: "Unauthorized - invalid API key" })
  @ApiResponse({
    status: 429,
    description: "Too many requests - rate limit exceeded",
  })
  @ApiResponse({ status: 500, description: "Internal server error" })
  async analyze(
    @Body() analyzeDto: AnalyzeDto,
    @Req() req: Request & { apiKeyId?: string },
  ) {
    try {
      this.logger.log(
        `Analysis request: ${analyzeDto.query.substring(0, 50)}...`,
      );

      // Get request metadata
      const ipAddress =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        (req.socket.remoteAddress as string);
      const userAgent = req.headers["user-agent"] as string;

      const result = await this.geospatialService.analyzeQuery(
        analyzeDto.query,
        {
          apiKeyId: req.apiKeyId,
          ipAddress,
          userAgent,
        },
      );
      return result;
    } catch (error) {
      this.logger.error(`Analysis failed: ${error.message}`);

      // Handle custom errors with appropriate messages
      if (error instanceof TimeoutError) {
        throw new HttpException(
          {
            success: false,
            error: error.message,
            code: "TIMEOUT",
          },
          HttpStatus.REQUEST_TIMEOUT,
        );
      }

      if (error instanceof RateLimitError) {
        throw new HttpException(
          {
            success: false,
            error: error.message,
            code: "RATE_LIMIT",
            retryAfter: error.retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (error instanceof McpConnectionError) {
        throw new HttpException(
          {
            success: false,
            error: "Service temporarily unavailable. Please try again later.",
            code: "MCP_UNAVAILABLE",
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      if (error instanceof OpenRouterError) {
        throw new HttpException(
          {
            success: false,
            error: error.message,
            code: "OPENROUTER_ERROR",
          },
          error.getStatus(),
        );
      }

      if (error instanceof ToolExecutionError) {
        throw new HttpException(
          {
            success: false,
            error: "Tool execution failed. Please try a different query.",
            code: "TOOL_ERROR",
            tool: error.toolName,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Generic error handling
      const isProduction = process.env.NODE_ENV === "production";
      const errorMessage = isProduction
        ? "Analysis failed. Please try again or contact support."
        : error.message;

      throw new HttpException(
        {
          success: false,
          error: errorMessage,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get("health")
  @Public() // Health check should be public
  @SkipThrottle() // Don't rate limit health checks
  @ApiOperation({
    summary: "Health check",
    description:
      "Check if the MCP server is connected and the API is operational. This endpoint is public and does not require authentication.",
  })
  @ApiResponse({
    status: 200,
    description: "Service is healthy",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        status: { type: "string", example: "MCP server running" },
        mcpConnected: { type: "boolean", example: true },
        mcpMode: { type: "string", example: "remote" },
        timestamp: { type: "string", example: "2026-01-20T09:30:00.000Z" },
      },
    },
  })
  health() {
    const mcpConnected = this.geospatialService.isMcpConnected();
    const mcpMode = this.geospatialService.getMcpMode();

    return {
      success: true,
      status: mcpConnected ? "MCP server running" : "MCP server not connected",
      mcpConnected,
      mcpMode,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("analytics")
  @ApiOperation({
    summary: "Get API analytics",
    description:
      "Retrieve usage statistics and analytics for the API. Shows total requests, success rate, avg response time, and cost estimates. Requires API key authentication.",
  })
  @ApiQuery({
    name: "days",
    required: false,
    type: Number,
    description: "Number of days to include in analytics (default: 7)",
    example: 7,
  })
  @ApiResponse({
    status: 200,
    description: "Analytics retrieved successfully",
    schema: {
      type: "object",
      properties: {
        period: { type: "string", example: "Last 7 days" },
        totalRequests: { type: "number", example: 1250 },
        successfulRequests: { type: "number", example: 1180 },
        failedRequests: { type: "number", example: 70 },
        successRate: { type: "string", example: "94.40" },
        avgResponseTime: { type: "number", example: 3450 },
        totalCost: { type: "string", example: "0.1234" },
        totalTokens: { type: "number", example: 245000 },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized - invalid API key" })
  async getAnalytics(@Query("days") days?: number) {
    try {
      const daysNum = days && !isNaN(days) ? parseInt(days.toString(), 10) : 7;
      const analytics = await this.databaseService.getAnalytics(daysNum);
      return analytics;
    } catch (error) {
      this.logger.error(`Analytics failed: ${error.message}`);
      throw new HttpException(
        {
          success: false,
          error: "Failed to retrieve analytics",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
