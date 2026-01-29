import { Injectable, Inject, Logger } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import * as crypto from "crypto";

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Generate a cache key from an object
   */
  private generateKey(prefix: string, data: any): string {
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex")
      .substring(0, 16);
    return `${prefix}:${hash}`;
  }

  /**
   * Cache OpenRouter API response
   * TTL: 1 hour (3600 seconds) - AI responses are relatively stable for similar queries
   */
  async cacheOpenRouterResponse(
    query: string,
    model: string,
    response: any,
  ): Promise<void> {
    try {
      const key = this.generateKey("openrouter", { query, model });
      await this.cacheManager.set(key, response, 3600000); // 1 hour in ms
      this.logger.debug(`Cached OpenRouter response: ${key}`);
    } catch (error) {
      this.logger.warn(`Failed to cache OpenRouter response: ${error.message}`);
    }
  }

  /**
   * Get cached OpenRouter response
   */
  async getCachedOpenRouterResponse(
    query: string,
    model: string,
  ): Promise<any | null> {
    try {
      const key = this.generateKey("openrouter", { query, model });
      const cached = await this.cacheManager.get(key);
      if (cached) {
        this.logger.debug(`Cache HIT for OpenRouter: ${key}`);
      } else {
        this.logger.debug(`Cache MISS for OpenRouter: ${key}`);
      }
      return cached || null;
    } catch (error) {
      this.logger.warn(
        `Failed to get cached OpenRouter response: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Cache MCP tool result
   * TTL: 30 minutes (1800 seconds) - Tool results change more frequently
   */
  async cacheMcpToolResult(
    toolName: string,
    args: any,
    result: any,
  ): Promise<void> {
    try {
      const key = this.generateKey("mcp-tool", { toolName, args });
      await this.cacheManager.set(key, result, 1800000); // 30 minutes in ms
      this.logger.debug(`Cached MCP tool result: ${key}`);
    } catch (error) {
      this.logger.warn(`Failed to cache MCP tool result: ${error.message}`);
    }
  }

  /**
   * Get cached MCP tool result
   */
  async getCachedMcpToolResult(
    toolName: string,
    args: any,
  ): Promise<any | null> {
    try {
      const key = this.generateKey("mcp-tool", { toolName, args });
      const cached = await this.cacheManager.get(key);
      if (cached) {
        this.logger.debug(`Cache HIT for MCP tool: ${key}`);
      } else {
        this.logger.debug(`Cache MISS for MCP tool: ${key}`);
      }
      return cached || null;
    } catch (error) {
      this.logger.warn(
        `Failed to get cached MCP tool result: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Cache analytics data
   * TTL: 5 minutes (300 seconds) - Analytics change frequently but can be slightly stale
   */
  async cacheAnalytics(days: number, data: any): Promise<void> {
    try {
      const key = `analytics:${days}d`;
      await this.cacheManager.set(key, data, 300000); // 5 minutes in ms
      this.logger.debug(`Cached analytics: ${key}`);
    } catch (error) {
      this.logger.warn(`Failed to cache analytics: ${error.message}`);
    }
  }

  /**
   * Get cached analytics
   */
  async getCachedAnalytics(days: number): Promise<any | null> {
    try {
      const key = `analytics:${days}d`;
      const cached = await this.cacheManager.get(key);
      if (cached) {
        this.logger.debug(`Cache HIT for analytics: ${key}`);
      } else {
        this.logger.debug(`Cache MISS for analytics: ${key}`);
      }
      return cached || null;
    } catch (error) {
      this.logger.warn(`Failed to get cached analytics: ${error.message}`);
      return null;
    }
  }

  /**
   * Cache system metrics
   * TTL: 1 minute (60 seconds) - Metrics need to be fresh
   */
  async cacheMetrics(data: any): Promise<void> {
    try {
      const key = "metrics:latest";
      await this.cacheManager.set(key, data, 60000); // 1 minute in ms
      this.logger.debug("Cached system metrics");
    } catch (error) {
      this.logger.warn(`Failed to cache metrics: ${error.message}`);
    }
  }

  /**
   * Get cached metrics
   */
  async getCachedMetrics(): Promise<any | null> {
    try {
      const key = "metrics:latest";
      const cached = await this.cacheManager.get(key);
      if (cached) {
        this.logger.debug("Cache HIT for metrics");
      } else {
        this.logger.debug("Cache MISS for metrics");
      }
      return cached || null;
    } catch (error) {
      this.logger.warn(`Failed to get cached metrics: ${error.message}`);
      return null;
    }
  }

  /**
   * Invalidate cache by pattern (if supported by cache store)
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      this.logger.debug(`Invalidating cache pattern: ${pattern}`);
      // Note: Pattern-based deletion requires Redis and won't work with in-memory cache
      // This is a placeholder for when Redis is configured
      // For in-memory cache, entire cache would need to be reset
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache pattern: ${error.message}`);
    }
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    try {
      // Reset method may not be available in all cache stores
      if (typeof (this.cacheManager as any).reset === "function") {
        await (this.cacheManager as any).reset();
      }
      this.logger.log("Cache cleared successfully");
    } catch (error) {
      this.logger.error(`Failed to clear cache: ${error.message}`);
    }
  }

  /**
   * Get cache statistics (if available)
   */
  async getStats(): Promise<any> {
    try {
      // This would require cache store to support stats
      // For now, return basic info
      const store = (this.cacheManager as any).store;
      return {
        type: store ? "redis" : "memory",
        status: "operational",
      };
    } catch (error) {
      this.logger.warn(`Failed to get cache stats: ${error.message}`);
      return null;
    }
  }
}
