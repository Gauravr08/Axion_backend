import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { DatabaseService } from "../database/database.service";

export const IS_PUBLIC_KEY = "isPublic";

@Injectable()
export class ApiKeyGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly validApiKeys: Set<string>;
  private useDatabaseValidation = false;

  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
    private databaseService: DatabaseService,
  ) {
    // Load API keys from config as fallback
    const apiKeysString = this.configService.get<string>("API_KEYS") || "";
    this.validApiKeys = new Set(
      apiKeysString
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key),
    );

    if (this.validApiKeys.size === 0) {
      this.logger.warn(
        "⚠️  No API keys configured in environment. Will check database.",
      );
    } else {
      this.logger.log(
        `✅ Loaded ${this.validApiKeys.size} API keys from environment`,
      );
    }
  }

  async onModuleInit() {
    // Check if database is available
    const databaseUrl = this.configService.get<string>("DATABASE_URL");

    if (databaseUrl && databaseUrl.trim() !== "") {
      try {
        // Test database connection and seed API keys
        const keys = Array.from(this.validApiKeys);
        if (keys.length > 0) {
          await this.databaseService.seedApiKeys(keys);
        }

        this.useDatabaseValidation = true;
        this.logger.log("✅ Database validation enabled");
      } catch (error) {
        this.logger.warn(
          `⚠️  Database not available, falling back to environment-based validation: ${error.message}`,
        );
        this.useDatabaseValidation = false;
      }
    } else {
      this.logger.warn(
        "⚠️  DATABASE_URL not configured. Using environment-based API key validation.",
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if endpoint is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      this.logger.warn("Request rejected: No API key provided");
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'API key is required. Include "x-api-key" header.',
        error: "Unauthorized",
      });
    }

    // Try database validation first
    if (this.useDatabaseValidation) {
      try {
        const apiKeyRecord = await this.databaseService.getApiKey(apiKey);

        if (!apiKeyRecord) {
          this.logger.warn(
            `Request rejected: Invalid API key (DB): ${apiKey.substring(0, 10)}...`,
          );
          throw new UnauthorizedException({
            statusCode: 401,
            message: "Invalid API key",
            error: "Unauthorized",
          });
        }

        if (!apiKeyRecord.enabled) {
          this.logger.warn(
            `Request rejected: Disabled API key: ${apiKey.substring(0, 10)}...`,
          );
          throw new UnauthorizedException({
            statusCode: 401,
            message: "API key is disabled",
            error: "Unauthorized",
          });
        }

        // Attach API key ID to request for usage tracking
        request.apiKey = apiKey;
        request.apiKeyId = apiKeyRecord.id;
        return true;
      } catch (error) {
        // If error is already UnauthorizedException, re-throw
        if (error instanceof UnauthorizedException) {
          throw error;
        }

        // Database error - fallback to environment validation
        this.logger.warn(
          `Database validation failed, falling back to environment: ${error.message}`,
        );
      }
    }

    // Fallback to environment-based validation
    if (!this.validApiKeys.has(apiKey)) {
      this.logger.warn(
        `Request rejected: Invalid API key (ENV): ${apiKey.substring(0, 10)}...`,
      );
      throw new UnauthorizedException({
        statusCode: 401,
        message: "Invalid API key",
        error: "Unauthorized",
      });
    }

    // Attach API key to request for logging purposes
    request.apiKey = apiKey;
    return true;
  }

  private extractApiKey(request: any): string | undefined {
    // Try different header formats
    return (
      request.headers["x-api-key"] ||
      request.headers["x_api_key"] ||
      request.headers["apikey"] ||
      request.query?.apiKey
    );
  }
}
