import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DatabaseService } from "../database/database.service";
import { GeospatialService } from "../geospatial/geospatial.service";

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private databaseService: DatabaseService,
    private geospatialService: GeospatialService,
  ) {}

  /**
   * Collect and store system metrics
   * Runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async collectSystemMetrics() {
    this.logger.debug("Collecting system metrics...");

    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get metrics for the last hour
      const [totalRequests, errorCount, usageData] = await Promise.all([
        this.databaseService.apiUsage.count({
          where: {
            createdAt: {
              gte: oneHourAgo,
            },
          },
        }),
        this.databaseService.apiUsage.count({
          where: {
            success: false,
            createdAt: {
              gte: oneHourAgo,
            },
          },
        }),
        this.databaseService.apiUsage.findMany({
          where: {
            createdAt: {
              gte: oneHourAgo,
            },
          },
          select: {
            responseTime: true,
            cost: true,
          },
        }),
      ]);

      // Calculate metrics
      const avgResponseTime =
        usageData.length > 0
          ? usageData.reduce(
              (sum, record) => sum + (record.responseTime || 0),
              0,
            ) / usageData.length
          : 0;

      const totalCost = usageData.reduce(
        (sum, record) => sum + (record.cost || 0),
        0,
      );

      // Store metrics
      await this.databaseService.systemMetrics.create({
        data: {
          mcpMode: "custom",
          mcpConnected: true,
          requestCount: totalRequests,
          errorCount,
          avgResponseTime: Math.round(avgResponseTime),
          openRouterCost: totalCost,
          timestamp: now,
        },
      });

      this.logger.debug(
        `Metrics collected: ${totalRequests} requests, ${errorCount} errors, ${avgResponseTime.toFixed(0)}ms avg response time`,
      );
    } catch (error) {
      this.logger.error("Failed to collect system metrics:", error);
    }
  }

  /**
   * Get current system health metrics
   */
  async getHealthMetrics() {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [totalRequests, successfulRequests, failedRequests, recentUsage] =
        await Promise.all([
          this.databaseService.apiUsage.count({
            where: {
              createdAt: {
                gte: oneDayAgo,
              },
            },
          }),
          this.databaseService.apiUsage.count({
            where: {
              success: true,
              createdAt: {
                gte: oneDayAgo,
              },
            },
          }),
          this.databaseService.apiUsage.count({
            where: {
              success: false,
              createdAt: {
                gte: oneDayAgo,
              },
            },
          }),
          this.databaseService.apiUsage.findMany({
            where: {
              createdAt: {
                gte: oneDayAgo,
              },
            },
            select: {
              responseTime: true,
              cost: true,
            },
            take: 1000, // Limit to last 1000 records for performance
          }),
        ]);

      const avgResponseTime =
        recentUsage.length > 0
          ? recentUsage.reduce((sum, r) => sum + (r.responseTime || 0), 0) /
            recentUsage.length
          : 0;

      const totalCost = recentUsage.reduce((sum, r) => sum + (r.cost || 0), 0);

      return {
        period: "Last 24 hours",
        totalRequests,
        successfulRequests,
        failedRequests,
        successRate:
          totalRequests > 0
            ? ((successfulRequests / totalRequests) * 100).toFixed(2)
            : "0.00",
        avgResponseTime: Math.round(avgResponseTime),
        totalCost: totalCost.toFixed(4),
        processingMode: "custom",
        timestamp: now.toISOString(),
      };
    } catch (error) {
      this.logger.error("Failed to get health metrics:", error);
      throw error;
    }
  }

  /**
   * Get historical metrics
   */
  async getHistoricalMetrics(hours: number = 24) {
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

      const metrics = await this.databaseService.systemMetrics.findMany({
        where: {
          timestamp: {
            gte: startTime,
          },
        },
        select: {
          id: true,
          mcpMode: true,
          mcpConnected: true,
          requestCount: true,
          errorCount: true,
          avgResponseTime: true,
          openRouterCost: true,
          timestamp: true,
        },
        orderBy: {
          timestamp: "asc",
        },
      });

      return {
        period: `Last ${hours} hours`,
        dataPoints: metrics.length,
        metrics,
      };
    } catch (error) {
      this.logger.error("Failed to get historical metrics:", error);
      throw error;
    }
  }
}
