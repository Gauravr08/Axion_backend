/**
 * COG (Cloud-Optimized GeoTIFF) Processor
 * Performs actual pixel-level analysis to calculate spectral indices
 * Replaces mock data with real satellite imagery processing
 */
import { Injectable, Logger } from '@nestjs/common';
import { fromUrl, GeoTIFF } from 'geotiff';
import { SpectralIndices } from '../dto/satellite-analysis.dto';

export interface BandData {
  red?: number[];
  green?: number[];
  blue?: number[];
  nir?: number[];
  swir1?: number[];
  swir2?: number[];
  width: number;
  height: number;
}

@Injectable()
export class CogProcessorService {
  private readonly logger = new Logger(CogProcessorService.name);

  /**
   * Fetch and process COG from URL with retry logic
   * FIXED: Handles network failures gracefully with exponential backoff
   * Uses overview (downsampled) images for faster processing
   */
  async fetchBandData(
    cogUrl: string,
    bbox?: [number, number, number, number],
  ): Promise<number[]> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Fetching COG (attempt ${attempt}/${maxRetries}): ${cogUrl.substring(0, 80)}...`);

        // ✅ CRITICAL FIX: Configure fetch with proper timeouts and pooling
        const fetchPromise = fromUrl(cogUrl, {
          allowFullFile: false,
          cacheSize: 1024 * 1024 * 50, // Increased to 50MB cache
          blockSize: 65536, // 64KB chunks (smaller = more reliable)
          headers: {
            'User-Agent': 'axion-backend/1.0.0',
            'Accept-Encoding': 'identity', // ✅ Disable compression for COGs
          },
        });

        // ✅ Longer timeout for large files (120 seconds instead of 60)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('COG fetch timeout after 120s')), 120000),
        );

        const tiff: GeoTIFF = await Promise.race([fetchPromise, timeoutPromise]);

        // Use overview image (downsampled) if available
        const imageCount = await tiff.getImageCount();
        const image = imageCount > 1
          ? await tiff.getImage(1) // Use first overview (1/4 resolution)
          : await tiff.getImage(0); // Full resolution if no overviews

        this.logger.debug(
          `Using COG image: ${image.getWidth()}x${image.getHeight()} (overviews: ${imageCount > 1})`,
        );

        // ✅ CRITICAL FIX: Read with smaller window to reduce data transfer
        const readWindow = bbox ? this.bboxToWindow(bbox, image) : undefined;
        
        // ✅ Read with interleave=false for faster processing
        const data = await image.readRasters({
          window: readWindow,
          samples: [0], // Read only first band
          interleave: false, // Don't interleave bands
          pool: null, // Disable worker pool (more stable on Windows)
        });

        const bandData = Array.from(data[0] as any) as number[];
        
        this.logger.log(
          `✅ Successfully fetched ${bandData.length} pixels from COG (${image.getWidth()}x${image.getHeight()})`,
        );
        
        return bandData;

      } catch (error) {
        lastError = error;
        this.logger.warn(
          `COG fetch attempt ${attempt}/${maxRetries} failed: ${error.message}`,
        );

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const waitMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          this.logger.debug(`Waiting ${waitMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
    }

    // ✅ All retries failed - throw error (will be caught by caller)
    this.logger.error(`Failed to fetch COG after ${maxRetries} attempts: ${lastError?.message}`);
    throw lastError || new Error('COG fetch failed');
  }

  /**
   * Calculate spectral indices from Sentinel-2 bands
   * Band mapping: B4=Red, B3=Green, B8=NIR, B11=SWIR
   * FIXED: Sequential fetching prevents connection overload
   */
  async calculateSpectralIndices(
    stacItem: any,
  ): Promise<SpectralIndices | null> {
    try {
      const assets = stacItem.assets;
      if (!assets) {
        throw new Error('No assets found in STAC item');
      }

      // Sentinel-2 L2A band mapping
      const redUrl = assets['red']?.href || assets['B04']?.href;
      const greenUrl = assets['green']?.href || assets['B03']?.href;
      const nirUrl = assets['nir']?.href || assets['B08']?.href;
      const swirUrl = assets['swir16']?.href || assets['B11']?.href;

      if (!redUrl || !nirUrl) {
        this.logger.warn('Missing required bands for spectral analysis');
        return null;
      }

      this.logger.log('Fetching satellite bands for spectral analysis...');

      // ✅ CRITICAL FIX: Fetch bands sequentially (not parallel) to avoid overwhelming connection
      this.logger.debug('Fetching RED band...');
      const redBand = await this.fetchBandData(redUrl);
      
      this.logger.debug('Fetching NIR band...');
      const nirBand = await this.fetchBandData(nirUrl);
      
      this.logger.debug('Fetching GREEN band...');
      const greenBand = greenUrl ? await this.fetchBandData(greenUrl) : [];
      
      this.logger.debug('Fetching SWIR band...');
      const swirBand = swirUrl ? await this.fetchBandData(swirUrl) : [];

      // Calculate average values for each band
      const redAvg = this.calculateAverage(redBand);
      const greenAvg = greenBand.length > 0 ? this.calculateAverage(greenBand) : 0;
      const nirAvg = this.calculateAverage(nirBand);
      const swirAvg = swirBand.length > 0 ? this.calculateAverage(swirBand) : 0;

      // Calculate spectral indices
      const indices: SpectralIndices = {
        ndvi: this.calculateNDVI(nirAvg, redAvg),
        ndbi: swirAvg ? this.calculateNDBI(swirAvg, nirAvg) : 0,
        ndwi: greenAvg ? this.calculateNDWI(greenAvg, nirAvg) : 0,
        ndmi: swirAvg ? this.calculateNDMI(nirAvg, swirAvg) : 0,
      };

      // Calculate EVI if all bands available
      if (greenAvg && redAvg && nirAvg) {
        indices.evi = this.calculateEVI(nirAvg, redAvg, greenAvg);
      }

      this.logger.log('✅ Spectral indices calculated successfully');
      return indices;
    } catch (error) {
      this.logger.error(
        `Spectral index calculation failed: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * NDVI: Normalized Difference Vegetation Index
   * Formula: (NIR - RED) / (NIR + RED)
   * Range: -1 to 1 (higher = more vegetation)
   */
  private calculateNDVI(nir: number, red: number): number {
    if (nir + red === 0) return 0;
    return (nir - red) / (nir + red);
  }

  /**
   * NDBI: Normalized Difference Built-up Index
   * Formula: (SWIR - NIR) / (SWIR + NIR)
   * Range: -1 to 1 (higher = more built-up areas)
   */
  private calculateNDBI(swir: number, nir: number): number {
    if (swir + nir === 0) return 0;
    return (swir - nir) / (swir + nir);
  }

  /**
   * NDWI: Normalized Difference Water Index
   * Formula: (GREEN - NIR) / (GREEN + NIR)
   * Range: -1 to 1 (higher = more water)
   */
  private calculateNDWI(green: number, nir: number): number {
    if (green + nir === 0) return 0;
    return (green - nir) / (green + nir);
  }

  /**
   * NDMI: Normalized Difference Moisture Index
   * Formula: (NIR - SWIR) / (NIR + SWIR)
   * Range: -1 to 1 (higher = more moisture)
   */
  private calculateNDMI(nir: number, swir: number): number {
    if (nir + swir === 0) return 0;
    return (nir - swir) / (nir + swir);
  }

  /**
   * EVI: Enhanced Vegetation Index
   * Formula: 2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))
   */
  private calculateEVI(nir: number, red: number, green: number): number {
    const denominator = nir + 6 * red - 7.5 * green + 1;
    if (denominator === 0) return 0;
    return 2.5 * ((nir - red) / denominator);
  }

  /**
   * Calculate average of pixel values
   */
  private calculateAverage(data: number[]): number {
    if (!data || data.length === 0) return 0;
    const sum = data.reduce((acc, val) => acc + val, 0);
    return sum / data.length;
  }

  /**
   * Calculate median of pixel values (more robust to outliers)
   */
  private calculateMedian(data: number[]): number {
    if (!data || data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Convert geographic bbox to pixel window
   * Implements proper geo-to-pixel coordinate transformation
   */
  private bboxToWindow(bbox: [number, number, number, number], image: any): any {
    try {
      const [west, south, east, north] = bbox;
      const imageBbox = image.getBoundingBox();
      const [imgWest, imgSouth, imgEast, imgNorth] = imageBbox;
      
      const width = image.getWidth();
      const height = image.getHeight();
      
      // Calculate pixel coordinates from geographic coordinates
      const xMin = Math.floor(((west - imgWest) / (imgEast - imgWest)) * width);
      const xMax = Math.ceil(((east - imgWest) / (imgEast - imgWest)) * width);
      const yMin = Math.floor(((imgNorth - north) / (imgNorth - imgSouth)) * height);
      const yMax = Math.ceil(((imgNorth - south) / (imgNorth - imgSouth)) * height);
      
      // Clamp to image bounds
      return {
        x: Math.max(0, Math.min(width, xMin)),
        y: Math.max(0, Math.min(height, yMin)),
        width: Math.max(1, Math.min(width - xMin, xMax - xMin)),
        height: Math.max(1, Math.min(height - yMin, yMax - yMin)),
      };
    } catch (error) {
      this.logger.warn(`Failed to calculate bbox window: ${error.message}. Using full image.`);
      // Fallback to full image
      return {
        x: 0,
        y: 0,
        width: image.getWidth(),
        height: image.getHeight(),
      };
    }
  }

  /**
   * Interpret spectral index values
   */
  interpretNDVI(ndvi: number): string {
    if (ndvi > 0.6) return 'Dense vegetation, healthy crops';
    if (ndvi > 0.3) return 'Moderate vegetation, grassland';
    if (ndvi > 0.1) return 'Sparse vegetation';
    if (ndvi > -0.1) return 'Bare soil, minimal vegetation';
    return 'Water, built-up areas, or snow';
  }

  interpretNDBI(ndbi: number): string {
    if (ndbi > 0.3) return 'Dense urban development';
    if (ndbi > 0.1) return 'Moderate urban development';
    if (ndbi > -0.1) return 'Mixed urban/vegetation';
    return 'Predominantly vegetation or water';
  }

  interpretNDWI(ndwi: number): string {
    if (ndwi > 0.3) return 'Water body present';
    if (ndwi > 0.1) return 'Wet soil or shallow water';
    if (ndwi > -0.1) return 'Moderate moisture';
    return 'Dry soil or vegetation';
  }

  interpretNDMI(ndmi: number): string {
    if (ndmi > 0.4) return 'High moisture content';
    if (ndmi > 0.2) return 'Moderate moisture';
    if (ndmi > 0) return 'Low moisture';
    return 'Very dry conditions';
  }
}
