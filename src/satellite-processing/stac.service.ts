/**
 * Enhanced STAC Service with Retry Logic and Error Handling
 * Replaces external MCP dependency with direct STAC API access
 */
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { ConfigService } from '@nestjs/config';

export interface STACItem {
  id: string;
  bbox?: number[];
  geometry?: any;
  properties?: Record<string, any>;
  assets?: Record<string, { href: string; title?: string; type?: string }>;
}

export interface STACCollection {
  id: string;
  title?: string;
  description?: string;
  extent?: any;
}

export interface STACSearchParams {
  collections?: string[];
  bbox?: [number, number, number, number];
  datetime?: string;
  limit?: number;
  query?: Record<string, any>;
}

@Injectable()
export class StacService {
  private readonly logger = new Logger(StacService.name);
  private http: AxiosInstance;
  private readonly endpoint: string;
  private readonly timeout = 20000;
  private readonly maxRetries = 3;

  constructor(private configService: ConfigService) {
    // Support multiple STAC endpoints for failover
    this.endpoint = (
      this.configService.get<string>('STAC_ENDPOINT') ||
      'https://earth-search.aws.element84.com/v1'
    ).replace(/\/$/, '');

    this.http = axios.create({
      baseURL: this.endpoint,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Configure axios-retry with exponential backoff
    axiosRetry(this.http, {
      retries: this.maxRetries,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        // Retry on network errors, timeouts, and 5xx errors
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status >= 500 && error.response?.status <= 599) ||
          error.code === 'ECONNABORTED'
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        this.logger.warn(
          `Retrying STAC request (${retryCount}/${this.maxRetries}): ${requestConfig.url} - ${error.message}`,
        );
      },
    });
  }

  /**
   * List available STAC collections
   */
  async listCollections(): Promise<STACCollection[]> {
    try {
      this.logger.debug('Fetching STAC collections');
      const { data } = await this.http.get('/collections');
      return (data.collections || []) as STACCollection[];
    } catch (error) {
      this.logger.error(`Failed to list collections: ${error.message}`);
      throw new Error(`STAC API error: ${error.message}`);
    }
  }

  /**
   * Get specific collection metadata
   */
  async getCollection(collectionId: string): Promise<STACCollection> {
    try {
      this.logger.debug(`Fetching collection: ${collectionId}`);
      const { data } = await this.http.get(
        `/collections/${encodeURIComponent(collectionId)}`,
      );
      return data as STACCollection;
    } catch (error) {
      this.logger.error(
        `Failed to get collection ${collectionId}: ${error.message}`,
      );
      throw new Error(`STAC API error: ${error.message}`);
    }
  }

  /**
   * Search for satellite imagery with retry logic
   */
  async searchItems(params: STACSearchParams): Promise<STACItem[]> {
    try {
      const body: Record<string, any> = {};
      if (params.collections) body.collections = params.collections;
      if (params.bbox) body.bbox = params.bbox;
      if (params.datetime) body.datetime = params.datetime;
      if (params.limit) body.limit = params.limit;
      if (params.query) body.query = params.query;

      this.logger.debug(`Searching STAC items: ${JSON.stringify(body)}`);

      const { data } = await this.http.post('/search', body);
      let features = data.features || [];

      // Post-filter by cloud cover if specified
      if (params.query?.['eo:cloud_cover']?.lt !== undefined) {
        const maxCloud = params.query['eo:cloud_cover'].lt;
        features = features.filter(
          (f: STACItem) => (f.properties?.['eo:cloud_cover'] ?? 100) < maxCloud,
        );
      }

      this.logger.log(`Found ${features.length} STAC items`);
      return features;
    } catch (error) {
      this.logger.error(`STAC search failed: ${error.message}`, error.stack);
      throw new Error(`STAC search error: ${error.message}`);
    }
  }

  /**
   * Parse bounding box from various formats
   */
  parseBbox(
    input?: string | number[],
  ): [number, number, number, number] | undefined {
    if (Array.isArray(input) && input.length === 4) {
      return input as [number, number, number, number];
    }
    if (typeof input === 'string') {
      const parts = input.split(',').map((s) => parseFloat(s.trim()));
      if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
        return parts as [number, number, number, number];
      }
    }
    return undefined;
  }

  /**
   * Create bbox from lat/lon center point and radius
   */
  createBboxFromPoint(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): [number, number, number, number] {
    // Simple approximation: 1 degree ≈ 111km at equator
    const degreeOffset = (radiusMeters / 111000) * 1.2; // 20% buffer
    return [
      longitude - degreeOffset,
      latitude - degreeOffset,
      longitude + degreeOffset,
      latitude + degreeOffset,
    ];
  }

  /**
   * Format datetime range for STAC API
   */
  formatDatetime(startDate?: string, endDate?: string): string | undefined {
    if (!startDate && !endDate) return undefined;

    const toRfc3339 = (date: string, isEnd = false) => {
      if (date.includes('T')) return date;
      return isEnd ? `${date}T23:59:59Z` : `${date}T00:00:00Z`;
    };

    if (startDate && endDate) {
      return `${toRfc3339(startDate)}/${toRfc3339(endDate, true)}`;
    }
    if (startDate) return `${toRfc3339(startDate)}/..`;
    if (endDate) return `../${toRfc3339(endDate, true)}`;
    return undefined;
  }

  /**
   * Get best quality image from STAC results
   */
  getBestQualityItem(items: STACItem[]): STACItem | null {
    if (!items || items.length === 0) return null;

    // Sort by cloud cover (ascending) and date (descending)
    return items.sort((a, b) => {
      const cloudA = a.properties?.['eo:cloud_cover'] ?? 100;
      const cloudB = b.properties?.['eo:cloud_cover'] ?? 100;
      if (cloudA !== cloudB) return cloudA - cloudB;

      const dateA = new Date(a.properties?.datetime || 0).getTime();
      const dateB = new Date(b.properties?.datetime || 0).getTime();
      return dateB - dateA;
    })[0];
  }

  /**
   * Check STAC API health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.http.get('/collections', { timeout: 5000 });
      return true;
    } catch (error) {
      this.logger.error(`STAC health check failed: ${error.message}`);
      return false;
    }
  }
}
