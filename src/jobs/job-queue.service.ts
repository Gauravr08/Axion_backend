/**
 * Job Queue Service
 * Centralized service for adding jobs to queues
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface CogProcessingJob {
  stacItemId: string;
  bbox: [number, number, number, number];
  requestId: string;
}

export interface DbWriteJob {
  table: 'api_usage' | 'system_metrics';
  data: any;
}

export interface CacheWarmingJob {
  location: string;
  bbox: [number, number, number, number];
  priority: 'high' | 'medium' | 'low';
}

@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);
  private queueAvailable = false;

  constructor(
    @Optional() @InjectQueue('cog-processing')
    private cogQueue?: Queue<CogProcessingJob>,
    @Optional() @InjectQueue('db-write')
    private dbQueue?: Queue<DbWriteJob>,
    @Optional() @InjectQueue('cache-warming')
    private cacheQueue?: Queue<CacheWarmingJob>,
  ) {
    // Check if Redis is configured before checking health
    const redisConfigured = process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_URL.trim() !== '';
    if (!redisConfigured || !this.cogQueue) {
      this.queueAvailable = false;
      // Don't check health if Redis is not configured (avoid connection errors)
      return;
    }
    // Check if queues are actually working
    this.checkQueueHealth();
  }

  private async checkQueueHealth() {
    try {
      const client = await this.cogQueue.client;
      await client.ping();
      this.queueAvailable = true;
      this.logger.log('✅ Job queues operational');
    } catch (error) {
      this.queueAvailable = false;
      // Silently disable queues, warning already logged in module
    }
  }

  /**
   * Add COG processing job
   */
  async addCogProcessing(data: CogProcessingJob, priority?: number) {
    if (!this.queueAvailable) {
      this.logger.debug('Queue unavailable - skipping COG processing job');
      return null;
    }

    try {
      const job = await this.cogQueue.add('process-cog', data, {
        priority: priority || 5,
      });
      this.logger.debug(`Added COG processing job: ${job.id}`);
      return job.id;
    } catch (error) {
      this.logger.error(
        `Failed to add COG processing job: ${error.message}`,
      );
      this.queueAvailable = false;
      return null;
    }
  }

  /**
   * Add database write job (fire-and-forget)
   */
  async addDbWrite(data: DbWriteJob) {
    if (!this.queueAvailable) {
      this.logger.debug('Queue unavailable - skipping DB write job');
      return null;
    }

    try {
      const job = await this.dbQueue.add('write-db', data, {
        priority: 10,
      });
      this.logger.debug(`Added DB write job: ${job.id}`);
      return job.id;
    } catch (error) {
      this.logger.error(
        `Failed to add DB write job: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Add cache warming job
   */
  async addCacheWarming(data: CacheWarmingJob) {
    if (!this.queueAvailable) {
      this.logger.debug('Queue unavailable - skipping cache warming job');
      return null;
    }

    try {
      const priorityMap = { high: 1, medium: 5, low: 10 };
      const job = await this.cacheQueue.add('warm-cache', data, {
        priority: priorityMap[data.priority],
      });
      this.logger.debug(`Added cache warming job: ${job.id}`);
      return job.id;
    } catch (error) {
      this.logger.error(
        `Failed to add cache warming job: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    if (!this.queueAvailable) {
      return {
        status: 'unavailable',
        message: 'Redis not configured - queues disabled',
      };
    }

    try {
      const [cogCounts, dbCounts, cacheCounts] = await Promise.all([
        this.cogQueue.getJobCounts(),
        this.dbQueue.getJobCounts(),
        this.cacheQueue.getJobCounts(),
      ]);

      return {
        status: 'operational',
        cogProcessing: cogCounts,
        dbWrite: dbCounts,
        cacheWarming: cacheCounts,
      };
    } catch (error) {
      this.logger.error(`Failed to get queue stats: ${error.message}`);
      this.queueAvailable = false;
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Pause/resume queues (for maintenance)
   */
  async pauseAll() {
    if (!this.queueAvailable) {
      return;
    }
    await Promise.all([
      this.cogQueue.pause(),
      this.dbQueue.pause(),
      this.cacheQueue.pause(),
    ]);
    this.logger.warn('All queues paused');
  }

  async resumeAll() {
    if (!this.queueAvailable) {
      return;
    }
    await Promise.all([
      this.cogQueue.resume(),
      this.dbQueue.resume(),
      this.cacheQueue.resume(),
    ]);
    this.logger.log('All queues resumed');
  }
}
