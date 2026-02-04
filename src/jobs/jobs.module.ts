/**
 * Job Queue Module
 * Handles background processing for COG analysis, database writes, and cache warming
 */
import { Module, DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CogProcessingProcessor } from './processors/cog-processing.processor.js';
import { DbWriteProcessor } from './processors/db-write.processor.js';
import { CacheWarmingProcessor } from './processors/cache-warming.processor.js';
import { JobQueueService } from './job-queue.service.js';
import { SatelliteProcessingModule } from '../satellite-processing/satellite-processing.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CachingModule } from '../cache/cache.module.js';

@Module({})
export class JobsModule {
  static forRoot(): DynamicModule {
    // Check if Redis is configured at module initialization
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    const isRedisConfigured = redisUrl && redisUrl.trim() !== '';
    
    const providers: any[] = [JobQueueService];
    const imports: any[] = [
      ConfigModule,
      SatelliteProcessingModule,
      DatabaseModule,
      CachingModule,
    ];
    
    // Only register BullMQ modules if Redis is configured
    if (isRedisConfigured) {
      imports.push(
        BullModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => {
            const redisUrl = configService.get<string>('UPSTASH_REDIS_URL');
            
            // Parse Redis URL
            const url = new URL(redisUrl);
            console.log('✅ Redis configured - Job queues and processors enabled');
            
            return {
              connection: {
                host: url.hostname,
                port: parseInt(url.port) || 6379,
                password: url.password,
                tls: url.protocol === 'rediss:' ? {} : undefined,
              },
              defaultJobOptions: {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 2000,
                },
                removeOnComplete: {
                  age: 3600, // Keep for 1 hour
                  count: 1000,
                },
                removeOnFail: {
                  age: 86400, // Keep failures for 24 hours
                },
              },
            };
          },
          inject: [ConfigService],
        }),
        BullModule.registerQueue(
          { name: 'cog-processing' },
          { name: 'db-write' },
          { name: 'cache-warming' },
        ),
      );
      
      providers.push(
        CogProcessingProcessor,
        DbWriteProcessor,
        CacheWarmingProcessor,
      );
    } else {
      console.warn('⚠️  UPSTASH_REDIS_URL not configured - Job queues disabled (operations will be synchronous)');
    }
    
    return {
      module: JobsModule,
      imports,
      providers,
      exports: [JobQueueService],
    };
  }
}
