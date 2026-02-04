/**
 * Satellite Processing Service
 * Main service for site analysis and growth trends - replaces MCP tools
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StacService, STACItem } from './stac.service';
import { CogProcessorService } from './processors/cog-processor.service';
import {
  SiteAnalysisDto,
  SiteAnalysisResult,
  GrowthTrendsDto,
  GrowthTrendsResult,
  SpectralAnalysisResult,
  SpectralIndices,
} from './dto/satellite-analysis.dto';

@Injectable()
export class SatelliteProcessingService {
  private readonly logger = new Logger(SatelliteProcessingService.name);
  private readonly titilerEndpoint: string;

  constructor(
    private stacService: StacService,
    private cogProcessor: CogProcessorService,
    private configService: ConfigService,
  ) {
    this.titilerEndpoint =
      this.configService.get<string>('TITILER_ENDPOINT') ||
      'https://titiler.xyz';
  }

  /**
   * Comprehensive site suitability analysis
   * Replaces axion_realestate site_analysis operation
   */
  async analyzeSite(params: SiteAnalysisDto): Promise<SiteAnalysisResult> {
    try {
      this.logger.log(
        `Analyzing site: ${JSON.stringify({ projectType: params.projectType, bbox: params.bbox })}`,
      );

      // Determine search bbox
      let bbox: [number, number, number, number];
      if (params.bbox) {
        bbox = params.bbox;
      } else if (params.latitude && params.longitude) {
        bbox = this.stacService.createBboxFromPoint(
          params.latitude,
          params.longitude,
          params.radius || 1000,
        );
      } else {
        throw new Error('Either bbox or latitude/longitude must be provided');
      }

      // Search for Sentinel-2 imagery
      const items = await this.stacService.searchItems({
        collections: ['sentinel-2-l2a'],
        bbox,
        datetime: this.stacService.formatDatetime(
          params.startDate,
          params.endDate,
        ),
        limit: 10,
        query: {
          'eo:cloud_cover': {
            lt: params.cloudCoverMax || 10,
          },
        },
      });

      if (!items || items.length === 0) {
        throw new Error(
          'No suitable satellite imagery found for the specified area and time range',
        );
      }

      // Get best quality image
      const bestItem = this.stacService.getBestQualityItem(items);
      if (!bestItem) {
        throw new Error('No valid imagery found');
      }

      this.logger.log(`Processing image: ${bestItem.id}`);

      // Calculate spectral indices from actual COG data
      const spectralAnalysis = await this.analyzeSpectralData(bestItem);

      // Calculate suitability score based on project type
      const suitabilityScore = this.calculateSuitability(
        spectralAnalysis.indices,
        params.projectType,
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        spectralAnalysis.indices,
        params.projectType,
        suitabilityScore,
      );

      // Generate warnings
      const warnings = this.generateWarnings(
        spectralAnalysis.indices,
        spectralAnalysis.cloudCover,
      );

      // Calculate area
      const area = this.calculateArea(bbox);

      // Generate visualization URLs and map data if requested
      let visualizationUrl: string | undefined;
      let mapUrl: string | undefined;
      let mapVisualization: any | undefined;

      if (params.includeVisualization) {
        const mapData = this.generateMapVisualization(
          bestItem,
          params.projectType,
          bbox,
        );
        visualizationUrl = mapData.previewUrl;
        mapUrl = mapData.tileUrl;
        mapVisualization = mapData;
      }

      return {
        success: true,
        suitabilityScore,
        spectralAnalysis,
        recommendations,
        warnings,
        visualizationUrl,
        mapUrl,
        mapVisualization,
        metadata: {
          satelliteSource: 'Sentinel-2 L2A',
          resolution: '10m',
          areaAnalyzed: area,
          imagesProcessed: items.length,
        },
      };
    } catch (error) {
      this.logger.error(`Site analysis failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Growth trends analysis - compare two time periods
   * Replaces axion_realestate growth_trends operation
   */
  async analyzeGrowthTrends(
    params: GrowthTrendsDto,
  ): Promise<GrowthTrendsResult> {
    try {
      this.logger.log(
        `Analyzing growth trends: baseline ${params.baselineStart} to ${params.baselineEnd}, current ${params.currentStart} to ${params.currentEnd}`,
      );

      // Fetch baseline imagery
      const baselineItems = await this.stacService.searchItems({
        collections: ['sentinel-2-l2a'],
        bbox: params.bbox,
        datetime: this.stacService.formatDatetime(
          params.baselineStart,
          params.baselineEnd,
        ),
        limit: 5,
        query: {
          'eo:cloud_cover': {
            lt: params.cloudCoverMax || 10,
          },
        },
      });

      // Fetch current imagery
      const currentItems = await this.stacService.searchItems({
        collections: ['sentinel-2-l2a'],
        bbox: params.bbox,
        datetime: this.stacService.formatDatetime(
          params.currentStart,
          params.currentEnd,
        ),
        limit: 5,
        query: {
          'eo:cloud_cover': {
            lt: params.cloudCoverMax || 10,
          },
        },
      });

      if (!baselineItems.length || !currentItems.length) {
        throw new Error(
          'Insufficient imagery for both time periods. Try expanding date ranges.',
        );
      }

      // Process both periods
      const baselineItem = this.stacService.getBestQualityItem(baselineItems);
      const currentItem = this.stacService.getBestQualityItem(currentItems);

      const baseline = await this.analyzeSpectralData(baselineItem);
      const current = await this.analyzeSpectralData(currentItem);

      // Calculate changes
      const ndviChange = current.indices.ndvi - baseline.indices.ndvi;
      const ndbiChange = current.indices.ndbi - baseline.indices.ndbi;

      // Calculate percentage changes
      const vegetationLoss =
        ndviChange < 0 ? Math.abs(ndviChange) * 100 : 0;
      const urbanExpansion = ndbiChange > 0 ? ndbiChange * 100 : 0;

      // Generate interpretation
      const interpretation = this.interpretGrowthTrends(
        ndviChange,
        ndbiChange,
        vegetationLoss,
        urbanExpansion,
      );

      return {
        success: true,
        changeDetection: {
          ndviChange,
          ndbiChange,
          vegetationLoss,
          urbanExpansion,
        },
        baseline,
        current,
        interpretation,
        visualizationUrl: this.generateTitilerUrl(currentItem, 'mixed'),
      };
    } catch (error) {
      this.logger.error(
        `Growth trends analysis failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Analyze spectral data from STAC item
   */
  private async analyzeSpectralData(
    item: STACItem,
  ): Promise<SpectralAnalysisResult> {
    // Calculate spectral indices from actual COG data - NO FALLBACK
    const indices = await this.cogProcessor.calculateSpectralIndices(item);

    if (!indices) {
      throw new Error('COG processing failed - real satellite data required');
    }

    const cloudCover = item.properties?.['eo:cloud_cover'] || 0;
    const acquisitionDate =
      item.properties?.datetime || new Date().toISOString();

    return {
      indices,
      interpretation: {
        vegetation: this.cogProcessor.interpretNDVI(indices.ndvi),
        urbanDevelopment: this.cogProcessor.interpretNDBI(indices.ndbi),
        waterPresence: this.cogProcessor.interpretNDWI(indices.ndwi),
        soilMoisture: this.cogProcessor.interpretNDMI(indices.ndmi),
      },
      confidence: this.calculateConfidence(cloudCover),
      cloudCover,
      acquisitionDate,
    };
  }

  /**
   * Calculate suitability score based on project type
   */
  private calculateSuitability(
    indices: SpectralIndices,
    projectType: string,
  ): number {
    let score = 50; // Base score

    switch (projectType) {
      case 'agricultural':
        // High NDVI = good for agriculture
        score += indices.ndvi * 30;
        score += indices.ndmi * 20; // Moisture important
        score -= Math.abs(indices.ndbi) * 10; // Less urban = better
        break;

      case 'residential':
      case 'commercial':
        // Moderate development, not too dense
        score += indices.ndbi * 15;
        score += (1 - Math.abs(indices.ndvi)) * 10; // Less vegetation ok
        score -= indices.ndwi * 10; // Avoid water bodies
        break;

      case 'industrial':
        // Can handle more development
        score += indices.ndbi * 20;
        score -= indices.ndwi * 15; // Avoid water
        break;

      case 'mixed':
        // Balance of all factors
        score += indices.ndvi * 10;
        score += indices.ndbi * 10;
        score += indices.ndmi * 10;
        break;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    indices: SpectralIndices,
    projectType: string,
    suitability: number,
  ): string[] {
    const recommendations: string[] = [];

    if (suitability >= 70) {
      recommendations.push(
        `Excellent site for ${projectType} development (${suitability.toFixed(1)}% suitable)`,
      );
    } else if (suitability >= 50) {
      recommendations.push(
        `Good site for ${projectType} development with moderate preparation`,
      );
    } else {
      recommendations.push(
        `Site may require significant preparation for ${projectType} development`,
      );
    }

    if (indices.ndvi > 0.5 && projectType !== 'agricultural') {
      recommendations.push(
        'Dense vegetation present - clearing may be required',
      );
    }

    if (indices.ndbi > 0.3) {
      recommendations.push(
        'Existing development detected - consider infill opportunities',
      );
    }

    if (indices.ndwi > 0.2) {
      recommendations.push(
        'Water features present - drainage assessment recommended',
      );
    }

    if (indices.ndmi < 0) {
      recommendations.push(
        'Dry conditions detected - irrigation may be necessary for landscaping',
      );
    }

    return recommendations;
  }

  /**
   * Generate warnings based on analysis
   */
  private generateWarnings(
    indices: SpectralIndices,
    cloudCover: number,
  ): string[] {
    const warnings: string[] = [];

    if (cloudCover > 20) {
      warnings.push(
        `High cloud cover (${cloudCover.toFixed(1)}%) may affect accuracy`,
      );
    }

    if (indices.ndwi > 0.4) {
      warnings.push('Significant water presence - flood risk assessment advised');
    }

    if (indices.ndbi > 0.5) {
      warnings.push(
        'High existing development - zoning and permit review required',
      );
    }

    return warnings;
  }

  /**
   * Generate TiTiler visualization URL
   * Uses direct COG URLs instead of STAC items to avoid CloudFront 494 errors
   */
  private generateTitilerUrl(item: STACItem, projectType: string): string {
    try {
      // Log available assets for debugging
      const availableAssets = Object.keys(item.assets || {});
      this.logger.debug(`Available STAC assets: ${availableAssets.join(', ')}`);
      
      const assets = item.assets;
      if (!assets) {
        throw new Error('No assets found in STAC item');
      }
      
      // Select the primary band URL for visualization
      let primaryBandUrl: string | undefined;
      let colormap = 'viridis';
      let rescale = '0,3000';
      
      switch (projectType) {
        case 'agricultural':
          // Use NIR band (B08) for vegetation - higher values = more vegetation
          primaryBandUrl = assets.B08?.href || assets.nir?.href;
          colormap = 'greens';
          rescale = '0,5000';
          break;
        case 'residential':
        case 'commercial':
        case 'industrial':
          // Use SWIR band (B11) for urban areas
          primaryBandUrl = assets.B11?.href || assets.swir22?.href;
          colormap = 'reds';
          rescale = '0,4000';
          break;
        default:
          // Use visual (TCI) or Red band for general overview
          primaryBandUrl = assets.visual?.href || assets.B04?.href || assets.red?.href;
          colormap = 'terrain';
          rescale = '0,3000';
      }
      
      // Fallback to any available visual band
      if (!primaryBandUrl) {
        primaryBandUrl = assets.visual?.href || 
                        assets.B04?.href || 
                        assets.B08?.href || 
                        assets.red?.href || 
                        assets.nir?.href;
        colormap = 'viridis';
      }
      
      if (!primaryBandUrl) {
        const assetKeys = Object.keys(assets).join(', ');
        throw new Error(`No suitable bands found. Available: ${assetKeys}`);
      }
      
      this.logger.debug(`Selected band URL: ${primaryBandUrl.substring(0, 100)}...`);
      
      // Generate preview image URL that can be viewed directly in browser
      const baseUrl = `${this.titilerEndpoint}/cog/preview.png`;
      const params = new URLSearchParams({
        url: primaryBandUrl,
        rescale: rescale,
        colormap_name: colormap,
        return_mask: 'true',
        max_size: '1024', // Limit preview size
      });
      
      const fullUrl = `${baseUrl}?${params.toString()}`;
      this.logger.debug(`Generated TiTiler preview URL (${fullUrl.length} chars)`);
      
      return fullUrl;
      
    } catch (error) {
      this.logger.error(`Failed to generate TiTiler URL: ${error.message}`, error.stack);
      // Return a safe fallback URL that won't break the response
      return `${this.titilerEndpoint}/docs`;
    }
  }

  /**
   * Generate complete map visualization data for interactive maps
   */
  private generateMapVisualization(
    item: STACItem,
    projectType: string,
    bbox: [number, number, number, number],
  ): any {
    try {
      const assets = item.assets;
      if (!assets) {
        throw new Error('No assets found in STAC item');
      }

      // Select the primary band URL
      let primaryBandUrl: string | undefined;
      let colormap = 'viridis';
      let rescale = '0,3000';

      switch (projectType) {
        case 'agricultural':
          primaryBandUrl = assets.B08?.href || assets.nir?.href;
          colormap = 'greens';
          rescale = '0,5000';
          break;
        case 'residential':
        case 'commercial':
        case 'industrial':
          primaryBandUrl = assets.B11?.href || assets.swir22?.href;
          colormap = 'reds';
          rescale = '0,4000';
          break;
        default:
          primaryBandUrl = assets.visual?.href || assets.B04?.href || assets.red?.href;
          colormap = 'terrain';
          rescale = '0,3000';
      }

      // Fallback
      if (!primaryBandUrl) {
        primaryBandUrl = assets.B08?.href || assets.B04?.href || assets.visual?.href;
        colormap = 'viridis';
      }

      if (!primaryBandUrl) {
        throw new Error('No suitable bands found');
      }

      // Use STAC item URL instead of direct COG URL (shorter URLs)
      const stacItemUrl = `https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${item.id}`;
      
      // Determine which bands to use based on project type
      let assetNames: string;
      switch (projectType) {
        case 'agricultural':
          assetNames = 'nir,red,green'; // False color for vegetation
          break;
        case 'residential':
        case 'commercial':
        case 'industrial':
          assetNames = 'swir22,swir16,red'; // False color for urban
          break;
        default:
          assetNames = 'red,green,blue'; // True color
      }
      
      // Generate tile URL template for interactive maps (using STAC endpoint)
      const tileBaseUrl = `${this.titilerEndpoint}/stac/tiles/WebMercatorQuad/{z}/{x}/{y}`;
      const tileParams = new URLSearchParams({
        url: stacItemUrl,
        assets: assetNames,
        rescale: rescale,
        colormap_name: colormap,
        return_mask: 'true',
      });
      const tileUrl = `${tileBaseUrl}?${tileParams.toString()}`;

      // Generate preview URL for fallback (using COG endpoint for preview)
      const previewBaseUrl = `${this.titilerEndpoint}/cog/preview.png`;
      const previewParams = new URLSearchParams({
        url: primaryBandUrl, // Use direct COG URL for preview only
        rescale: rescale,
        colormap_name: colormap,
        return_mask: 'true',
        max_size: '1024',
      });
      const previewUrl = `${previewBaseUrl}?${previewParams.toString()}`;

      // Calculate center point and zoom level
      const [west, south, east, north] = bbox;
      const center = {
        lat: (south + north) / 2,
        lon: (west + east) / 2,
      };

      // Calculate appropriate zoom level based on bbox size
      const latDiff = north - south;
      const lonDiff = east - west;
      const maxDiff = Math.max(latDiff, lonDiff);
      
      let suggestedZoom: number;
      if (maxDiff > 10) suggestedZoom = 6; // State level
      else if (maxDiff > 5) suggestedZoom = 7;
      else if (maxDiff > 2) suggestedZoom = 8;
      else if (maxDiff > 1) suggestedZoom = 9;
      else if (maxDiff > 0.5) suggestedZoom = 10;
      else if (maxDiff > 0.1) suggestedZoom = 12;
      else suggestedZoom = 14; // City level

      return {
        tileUrl,
        previewUrl,
        bounds: {
          west,
          south,
          east,
          north,
        },
        center,
        suggestedZoom,
        colormap,
      };
    } catch (error) {
      this.logger.error(`Failed to generate map visualization: ${error.message}`);
      return {
        tileUrl: `${this.titilerEndpoint}/docs`,
        previewUrl: `${this.titilerEndpoint}/docs`,
        bounds: { west: 0, south: 0, east: 0, north: 0 },
        center: { lat: 0, lon: 0 },
        suggestedZoom: 10,
        colormap: 'viridis',
      };
    }
  }


  /**
   * Calculate area from bbox (approximate)
   */
  private calculateArea(bbox: [number, number, number, number]): number {
    const [west, south, east, north] = bbox;
    const width = (east - west) * 111000; // degrees to meters at equator
    const height = (north - south) * 111000;
    return width * height;
  }

  /**
   * Calculate confidence based on cloud cover and data quality
   */
  private calculateConfidence(cloudCover: number): number {
    return Math.max(0, 100 - cloudCover * 2);
  }

  /**
   * Interpret growth trends
   */
  private interpretGrowthTrends(
    ndviChange: number,
    ndbiChange: number,
    vegetationLoss: number,
    urbanExpansion: number,
  ): string {
    const parts: string[] = [];

    if (Math.abs(ndviChange) < 0.05 && Math.abs(ndbiChange) < 0.05) {
      return 'Minimal change detected between the two periods. Area remains stable.';
    }

    if (ndviChange < -0.1) {
      parts.push(
        `Significant vegetation loss (${vegetationLoss.toFixed(1)}%)`,
      );
    } else if (ndviChange > 0.1) {
      parts.push('Vegetation growth detected');
    }

    if (ndbiChange > 0.1) {
      parts.push(
        `Urban expansion identified (${urbanExpansion.toFixed(1)}% increase)`,
      );
    } else if (ndbiChange < -0.1) {
      parts.push('Reduction in built-up areas');
    }

    return parts.join('. ') + '.';
  }

  /**
   * Fallback mock spectral analysis (if COG processing fails)
   */
  private generateMockSpectralAnalysis(
    item: STACItem,
  ): SpectralAnalysisResult {
    const cloudCover = item.properties?.['eo:cloud_cover'] || 0;
    const acquisitionDate =
      item.properties?.datetime || new Date().toISOString();

    // Generate reasonable mock values
    const indices: SpectralIndices = {
      ndvi: 0.3 + Math.random() * 0.4, // 0.3 to 0.7
      ndbi: -0.1 + Math.random() * 0.3, // -0.1 to 0.2
      ndwi: -0.2 + Math.random() * 0.3, // -0.2 to 0.1
      ndmi: 0.1 + Math.random() * 0.3, // 0.1 to 0.4
    };

    return {
      indices,
      interpretation: {
        vegetation: 'Moderate vegetation (estimated)',
        urbanDevelopment: 'Low to moderate development (estimated)',
        waterPresence: 'Minimal water presence (estimated)',
        soilMoisture: 'Moderate moisture (estimated)',
      },
      confidence: Math.max(50, 100 - cloudCover * 2),
      cloudCover,
      acquisitionDate,
    };
  }
}
