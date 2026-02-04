/**
 * Database Write Queue Processor
 * Handles background database writes (api_usage, metrics)
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DatabaseService } from '../../database/database.service';
import { DbWriteJob } from '../job-queue.service';

@Processor('db-write')
export class DbWriteProcessor extends WorkerHost {
  private readonly logger = new Logger(DbWriteProcessor.name);

  constructor(private databaseService: DatabaseService) {
    super();
  }

  async process(job: Job<DbWriteJob>) {
    this.logger.debug(`Processing DB write job ${job.id} for table ${job.data.table}`);

    try {
      const { table, data } = job.data;

      if (table === 'api_usage') {
        await this.databaseService.apiUsage.create({ data });
      } else if (table === 'system_metrics') {
        await this.databaseService.systemMetrics.create({ data });
      }

      this.logger.debug(`DB write job ${job.id} completed`);
      return { success: true };
    } catch (error) {
      this.logger.error(`DB write job ${job.id} failed: ${error.message}`, error.stack);
      // Don't throw - allow retries
      throw error;
    }
  }
}
