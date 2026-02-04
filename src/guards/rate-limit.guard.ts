import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/**
 * Rate limiting guard to prevent API abuse
 * Implements sliding window rate limiting per API key
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private requestCounts = new Map<string, RateLimitRecord>();
  private readonly windowMs = 60 * 60 * 1000; // 1 hour window
  private readonly maxRequests = 100; // Max 100 requests per hour per API key

  constructor(private reflector: Reflector) {
    // Clean up expired records every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] || 'anonymous';

    const now = Date.now();
    const record = this.requestCounts.get(apiKey);

    // Initialize or reset if window expired
    if (!record || record.resetAt < now) {
      this.requestCounts.set(apiKey, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return true;
    }

    // Check if limit exceeded
    if (record.count >= this.maxRequests) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          error: 'Too Many Requests',
          retryAfter: retryAfter,
          limit: this.maxRequests,
          window: '1 hour',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter
    record.count++;
    return true;
  }

  /**
   * Clean up expired records to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, record] of this.requestCounts.entries()) {
      if (record.resetAt < now) {
        expired.push(key);
      }
    }

    expired.forEach((key) => this.requestCounts.delete(key));
  }

  /**
   * Get current rate limit status for an API key (for debugging)
   */
  getStatus(apiKey: string): { count: number; remaining: number; resetAt: number } | null {
    const record = this.requestCounts.get(apiKey);
    if (!record) return null;

    return {
      count: record.count,
      remaining: Math.max(0, this.maxRequests - record.count),
      resetAt: record.resetAt,
    };
  }
}
