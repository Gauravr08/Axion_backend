import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  constructor(private databaseService: DatabaseService) {}

  /**
   * Clean up old API usage records
   * Runs daily at 2:00 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldUsageRecords() {
    this.logger.log("Starting data retention cleanup...");

    try {
      const retentionDays = parseInt(
        process.env.DATA_RETENTION_DAYS || "30",
        10,
      );
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.databaseService.apiUsage.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      this.logger.log(
        `Deleted ${result.count} old usage records (older than ${retentionDays} days)`,
      );

      // Also clean up old system metrics
      const metricsResult = await this.databaseService.systemMetrics.deleteMany(
        {
          where: {
            timestamp: {
              lt: cutoffDate,
            },
          },
        },
      );

      this.logger.log(
        `Deleted ${metricsResult.count} old system metrics (older than ${retentionDays} days)`,
      );

      return {
        usageRecordsDeleted: result.count,
        metricsDeleted: metricsResult.count,
      };
    } catch (error) {
      this.logger.error("Failed to cleanup old records:", error);
      throw error;
    }
  }

  /**
   * Manual cleanup trigger (for testing or admin use)
   */
  async manualCleanup(days: number = 30) {
    this.logger.log(
      `Manual cleanup triggered for records older than ${days} days`,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
      const result = await this.databaseService.apiUsage.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      return {
        deleted: result.count,
        cutoffDate: cutoffDate.toISOString(),
      };
    } catch (error) {
      this.logger.error("Manual cleanup failed:", error);
      throw error;
    }
  }

  /**
   * Get statistics about data that would be deleted
   */
  async getCleanupPreview(days: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
      const count = await this.databaseService.apiUsage.count({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      return {
        recordsToDelete: count,
        cutoffDate: cutoffDate.toISOString(),
        retentionDays: days,
      };
    } catch (error) {
      this.logger.error("Failed to get cleanup preview:", error);
      throw error;
    }
  }
}
