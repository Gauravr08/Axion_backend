import { Module, Global } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { redisStore } from "cache-manager-ioredis-yet";
import type { RedisOptions } from "ioredis";
import { CacheService } from "./cache.service";

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>("UPSTASH_REDIS_URL");
        const redisToken = configService.get<string>("UPSTASH_REDIS_TOKEN");

        // If Redis is configured (Upstash), use it
        if (
          redisUrl &&
          redisToken &&
          redisUrl.trim() !== "" &&
          redisToken.trim() !== ""
        ) {
          console.log("✅ Using Upstash Redis for caching");

          // Parse Upstash URL
          const url = new URL(redisUrl);

          const redisOptions: RedisOptions = {
            host: url.hostname,
            port: parseInt(url.port) || 6379,
            password: redisToken,
            tls: url.protocol === "https:" ? {} : undefined,
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => {
              if (times > 3) {
                console.warn(
                  "⚠️  Redis connection failed, falling back to memory cache",
                );
                return null; // Stop retrying
              }
              return Math.min(times * 100, 2000); // Exponential backoff
            },
          };

          try {
            return {
              store: await redisStore(redisOptions),
              ttl: 300000, // 5 minutes default TTL (in milliseconds)
              max: 1000, // Max items in cache
            };
          } catch (error) {
            console.warn(
              "⚠️  Failed to connect to Redis, using in-memory cache:",
              error.message,
            );
            // Fall through to in-memory cache
          }
        }

        // Fallback to in-memory cache
        console.log("ℹ️  Using in-memory cache (Redis not configured)");
        return {
          ttl: 300000, // 5 minutes
          max: 100, // Limit memory usage
        };
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheModule, CacheService],
})
export class CachingModule {}
