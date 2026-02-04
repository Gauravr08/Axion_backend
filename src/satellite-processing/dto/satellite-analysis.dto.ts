/**
 * Data Transfer Objects for Satellite Processing Service
 */

export class SpectralIndices {
  ndvi: number;  // Normalized Difference Vegetation Index
  ndbi: number;  // Normalized Difference Built-up Index
  ndwi: number;  // Normalized Difference Water Index
  ndmi: number;  // Normalized Difference Moisture Index
  evi?: number;  // Enhanced Vegetation Index (optional)
}

export class SiteAnalysisDto {
  bbox?: [number, number, number, number];
  latitude?: number;
  longitude?: number;
  radius?: number; // meters
  projectType: 'residential' | 'commercial' | 'industrial' | 'mixed' | 'agricultural';
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  cloudCoverMax?: number; // 0-100
  includeVisualization?: boolean;
  detailedMetrics?: boolean;
}

export class GrowthTrendsDto {
  bbox: [number, number, number, number];
  baselineStart: string; // YYYY-MM-DD
  baselineEnd: string; // YYYY-MM-DD
  currentStart: string; // YYYY-MM-DD
  currentEnd: string; // YYYY-MM-DD
  cloudCoverMax?: number;
}

export class SpectralAnalysisResult {
  indices: SpectralIndices;
  interpretation: {
    vegetation: string;
    urbanDevelopment: string;
    waterPresence: string;
    soilMoisture: string;
  };
  confidence: number; // 0-100
  cloudCover: number; // 0-100
  acquisitionDate: string;
}

export class MapVisualization {
  tileUrl: string; // URL template with {z}/{x}/{y} for interactive maps
  previewUrl: string; // Static preview image
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  center: {
    lat: number;
    lon: number;
  };
  suggestedZoom: number;
  colormap: string;
}

export class SiteAnalysisResult {
  success: boolean;
  suitabilityScore: number; // 0-100
  spectralAnalysis: SpectralAnalysisResult;
  recommendations: string[];
  warnings: string[];
  visualizationUrl?: string;
  mapUrl?: string;
  mapVisualization?: MapVisualization; // New: Full map data for interactive viewers
  metadata: {
    satelliteSource: string;
    resolution: string;
    areaAnalyzed: number; // square meters
    imagesProcessed: number;
  };
}

export class GrowthTrendsResult {
  success: boolean;
  changeDetection: {
    ndviChange: number; // -2 to 2
    ndbiChange: number; // -2 to 2
    vegetationLoss: number; // percentage
    urbanExpansion: number; // percentage
  };
  baseline: SpectralAnalysisResult;
  current: SpectralAnalysisResult;
  interpretation: string;
  visualizationUrl?: string;
  mapVisualization?: MapVisualization; // New: Full map data
}
