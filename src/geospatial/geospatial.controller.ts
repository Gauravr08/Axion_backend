import {
  Controller,
  Post,
  Get,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiSecurity,
} from "@nestjs/swagger";
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import { GeospatialService } from "./geospatial.service";
import { AnalyzeDto } from "./dto/analyze.dto";
import { Public } from "../decorators/public.decorator";

@ApiTags("Geospatial Analysis")
@ApiSecurity("api-key")
@Controller("api/geospatial")
export class GeospatialController {
  private readonly logger = new Logger(GeospatialController.name);

  constructor(private readonly geospatialService: GeospatialService) {}

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
  async analyze(@Body() analyzeDto: AnalyzeDto) {
    try {
      this.logger.log(
        `Analysis request: ${analyzeDto.query.substring(0, 50)}...`,
      );
      const result = await this.geospatialService.analyzeQuery(
        analyzeDto.query,
      );
      return result;
    } catch (error) {
      this.logger.error(`Analysis failed: ${error.message}`);

      // Don't expose internal errors to client
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
}
