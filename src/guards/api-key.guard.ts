import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";

export const IS_PUBLIC_KEY = "isPublic";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly validApiKeys: Set<string>;

  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
  ) {
    // Load API keys from config and store in a Set for fast lookup
    const apiKeysString = this.configService.get<string>("API_KEYS") || "";
    this.validApiKeys = new Set(
      apiKeysString
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key),
    );

    if (this.validApiKeys.size === 0) {
      this.logger.warn(
        "⚠️  No API keys configured. All requests will be rejected!",
      );
    } else {
      this.logger.log(`✅ Loaded ${this.validApiKeys.size} valid API keys`);
    }
  }

  canActivate(context: ExecutionContext): boolean {
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

    if (!this.validApiKeys.has(apiKey)) {
      this.logger.warn(
        `Request rejected: Invalid API key: ${apiKey.substring(0, 10)}...`,
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
