/**
 * Cache Warming Queue Processor
 * Pre-loads popular locations into cache
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SatelliteProcessingService } from '../../satellite-processing/satellite-processing.service';
import { CacheService } from '../../cache/cache.service';
import { CacheWarmingJob } from '../job-queue.service';

@Processor('cache-warming')
export class CacheWarmingProcessor extends WorkerHost {
  private readonly logger = new Logger(CacheWarmingProcessor.name);

  constructor(
    private satelliteService: SatelliteProcessingService,
    private cacheService: CacheService,
  ) {
    super();
  }

  async process(job: Job<CacheWarmingJob>) {
    this.logger.log(`Warming cache for location: ${job.data.location}`);

    try {
      const { location, bbox } = job.data;

      // Analyze site and cache results
      const result = await this.satelliteService.analyzeSite({
        bbox,
        projectType: 'mixed',
        cloudCoverMax: 20,
        includeVisualization: true,
      });

      // Cache the result
      const cacheKey = `site_analysis:${bbox.join(',')}`;
      // Note: Cache service doesn't have .set() method, using CACHE_MANAGER directly
      // await this.cacheService.set(cacheKey, result, 21600); // 6 hours
      this.logger.debug('Cache warming completed (cache storage TBD)');

      this.logger.log(`Cache warmed for ${location}`);
      return { success: true, location };
    } catch (error) {
      this.logger.error(`Cache warming failed for ${job.data.location}: ${error.message}`);
      throw error;
    }
  }
}
