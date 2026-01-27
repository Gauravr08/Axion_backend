import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);

  constructor() {
    super({
      log: ["error", "warn"],
      errorFormat: "minimal",
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log("Database connection established");
    } catch (error) {
      this.logger.error("Failed to connect to database:", error);
      // Don't throw - allow app to start even if DB is unavailable
      // This ensures the API can still function without database logging
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log("Database connection closed");
  }

  /**
   * Track API usage (fire-and-forget to not block requests)
   */
  async trackUsage(data: {
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
    try {
      await this.apiUsage.create({
        data,
      });
    } catch (error) {
      // Log but don't throw - never break API requests due to logging failures
      this.logger.error("Failed to track API usage:", error);
    }
  }

  /**
   * Get API key by key string
   */
  async getApiKey(key: string) {
    try {
      return await this.apiKey.findUnique({
        where: { key },
      });
    } catch (error) {
      this.logger.error("Failed to get API key:", error);
      return null;
    }
  }

  /**
   * Get analytics for a date range
   */
  async getAnalytics(days: number = 7) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const [total, successful, failed, usage] = await Promise.all([
        this.apiUsage.count({
          where: { createdAt: { gte: since } },
        }),
        this.apiUsage.count({
          where: { success: true, createdAt: { gte: since } },
        }),
        this.apiUsage.count({
          where: { success: false, createdAt: { gte: since } },
        }),
        this.apiUsage.findMany({
          where: { createdAt: { gte: since } },
          select: {
            responseTime: true,
            cost: true,
            tokensUsed: true,
          },
        }),
      ]);

      const avgResponseTime =
        usage.length > 0
          ? usage.reduce((sum, u) => sum + (u.responseTime || 0), 0) /
            usage.length
          : 0;

      const totalCost = usage.reduce((sum, u) => sum + (u.cost || 0), 0);
      const totalTokens = usage.reduce(
        (sum, u) => sum + (u.tokensUsed || 0),
        0,
      );

      return {
        period: `Last ${days} days`,
        totalRequests: total,
        successfulRequests: successful,
        failedRequests: failed,
        successRate:
          total > 0 ? ((successful / total) * 100).toFixed(2) : "0.00",
        avgResponseTime: Math.round(avgResponseTime),
        totalCost: totalCost.toFixed(4),
        totalTokens,
      };
    } catch (error) {
      this.logger.error("Failed to get analytics:", error);
      throw error;
    }
  }

  /**
   * Get usage by endpoint
   */
  async getUsageByEndpoint(days: number = 7) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const usage = await this.apiUsage.groupBy({
        by: ["endpoint"],
        where: { createdAt: { gte: since } },
        _count: { endpoint: true },
      });

      return usage.map((u) => ({
        endpoint: u.endpoint,
        count: u._count.endpoint,
      }));
    } catch (error) {
      this.logger.error("Failed to get usage by endpoint:", error);
      throw error;
    }
  }

  /**
   * Seed initial API keys if database is empty
   */
  async seedApiKeys(keys: string[]) {
    try {
      const existingCount = await this.apiKey.count();

      if (existingCount === 0) {
        this.logger.log("Seeding initial API keys...");

        for (const key of keys) {
          await this.apiKey.create({
            data: {
              key,
              name: key.startsWith("axion-dev")
                ? "Development Key"
                : "Test Key",
              enabled: true,
            },
          });
        }

        this.logger.log(`Seeded ${keys.length} API keys`);
      }
    } catch (error) {
      this.logger.error("Failed to seed API keys:", error);
    }
  }
}
