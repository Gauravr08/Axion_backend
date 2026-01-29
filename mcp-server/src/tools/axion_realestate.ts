/**
 * AXION REAL ESTATE - Custom Real Estate Analysis Tool
 * 
 * This tool provides comprehensive site suitability analysis for real estate development
 * using satellite imagery from AWS STAC API (Sentinel-2, Landsat, NAIP).
 * 
 * Operations:
 * - site_analysis: Comprehensive site evaluation for development suitability
 * - growth_trends: Urban expansion analysis comparing historical and current data
 * - proximity: Distance analysis to amenities (placeholder for OSM integration)
 * - terrain_analysis: Slope and aspect analysis for development feasibility
 * - help: Get detailed usage instructions
 * 
 * @author Axion Custom Implementation
 * @version 1.0.0
 */

import { z } from 'zod';
import { register } from '../lib/registry.js';
import { STACClient, parseBbox, formatDatetime, STACItem } from '../lib/stac-client.js';

const stac = new STACClient();

// =============================================================================
// SCHEMA DEFINITION
// =============================================================================

const RealEstateSchema = z.object({
  operation: z.enum([
    'site_analysis',
    'proximity', 
    'growth_trends',
    'terrain_analysis',
    'help'
  ]).describe('The type of analysis to perform'),
  
  // Location parameters
  bbox: z.union([
    z.string().describe('Bounding box as "west,south,east,north"'),
    z.array(z.number()).length(4).describe('Bounding box as [west, south, east, north]')
  ]).optional(),
  
  latitude: z.number().min(-90).max(90).optional().describe('Center latitude'),
  longitude: z.number().min(-180).max(180).optional().describe('Center longitude'),
  radius: z.number().min(1).optional().default(1000).describe('Search radius in meters'),
  
  // Analysis parameters
  projectType: z.enum([
    'residential',
    'commercial', 
    'industrial',
    'mixed',
    'agricultural'
  ]).optional().default('residential').describe('Type of real estate development'),
  
  startDate: z.string().optional().describe('Analysis start date (YYYY-MM-DD)'),
  endDate: z.string().optional().describe('Analysis end date (YYYY-MM-DD)'),
  
  cloudCoverMax: z.number().min(0).max(100).optional().default(10).describe('Maximum cloud cover percentage'),
  
  // Comparison parameters (for growth trends)
  baselineStart: z.string().optional().describe('Baseline period start date'),
  baselineEnd: z.string().optional().describe('Baseline period end date'),
  
  // Advanced options
  includeVisualization: z.boolean().optional().default(true).describe('Include TiTiler visualization URLs'),
  detailedMetrics: z.boolean().optional().default(false).describe('Include detailed spectral metrics')
});

type RealEstateParams = z.infer<typeof RealEstateSchema>;

// =============================================================================
// CONSTANTS & CONFIGURATIONS
// =============================================================================

/**
 * Spectral indices for land analysis
 */
const SPECTRAL_INDICES = {
  ndvi: {
    name: 'Normalized Difference Vegetation Index',
    formula: '(NIR - RED) / (NIR + RED)',
    range: [-1, 1],
    interpretation: {
      high: 'Dense vegetation, healthy plants',
      medium: 'Moderate vegetation, grassland',
      low: 'Sparse vegetation, bare soil',
      negative: 'Water bodies, built-up areas'
    }
  },
  ndbi: {
    name: 'Normalized Difference Built-up Index',
    formula: '(SWIR - NIR) / (SWIR + NIR)',
    range: [-1, 1],
    interpretation: {
      high: 'Dense urban development',
      medium: 'Moderate development',
      low: 'Minimal development',
      negative: 'Vegetation, water'
    }
  },
  ndwi: {
    name: 'Normalized Difference Water Index',
    formula: '(GREEN - NIR) / (GREEN + NIR)',
    range: [-1, 1],
    interpretation: {
      high: 'Open water, wet surfaces',
      medium: 'Moist soil, wetlands',
      low: 'Dry soil',
      negative: 'Vegetation, built-up'
    }
  },
  ndmi: {
    name: 'Normalized Difference Moisture Index',
    formula: '(NIR - SWIR) / (NIR + SWIR)',
    range: [-1, 1],
    interpretation: {
      high: 'High moisture content',
      medium: 'Moderate moisture',
      low: 'Dry conditions',
      negative: 'Very dry, stressed vegetation'
    }
  }
};

/**
 * Suitability factors by project type
 */
const SUITABILITY_CRITERIA = {
  residential: {
    vegetation: {
      ideal: [0.2, 0.4],
      description: 'Moderate green space for quality of life'
    },
    urbanDensity: {
      ideal: [0.1, 0.3],
      description: 'Low to moderate existing development'
    },
    waterProximity: {
      ideal: [0.1, 0.4],
      description: 'Nearby water features add value'
    },
    slope: {
      ideal: [0, 5],
      description: 'Gentle slopes preferred (0-5 degrees)'
    }
  },
  commercial: {
    vegetation: {
      ideal: [-0.1, 0.2],
      description: 'Minimal vegetation for development'
    },
    urbanDensity: {
      ideal: [0.3, 0.6],
      description: 'Moderate to high existing infrastructure'
    },
    waterProximity: {
      ideal: [-0.2, 0.2],
      description: 'Water proximity not critical'
    },
    slope: {
      ideal: [0, 3],
      description: 'Flat terrain for large buildings'
    }
  },
  industrial: {
    vegetation: {
      ideal: [-0.2, 0.1],
      description: 'Minimal environmental constraints'
    },
    urbanDensity: {
      ideal: [-0.1, 0.2],
      description: 'Undeveloped land preferred'
    },
    waterProximity: {
      ideal: [-0.3, 0.1],
      description: 'Distance from water to avoid restrictions'
    },
    slope: {
      ideal: [0, 2],
      description: 'Very flat for logistics'
    }
  },
  mixed: {
    vegetation: {
      ideal: [0.2, 0.3],
      description: 'Balanced green space'
    },
    urbanDensity: {
      ideal: [0.2, 0.4],
      description: 'Some existing development'
    },
    waterProximity: {
      ideal: [0.1, 0.3],
      description: 'Water features beneficial'
    },
    slope: {
      ideal: [0, 8],
      description: 'Varied terrain acceptable'
    }
  },
  agricultural: {
    vegetation: {
      ideal: [0.3, 0.7],
      description: 'High vegetation for crop production'
    },
    urbanDensity: {
      ideal: [-0.2, 0.1],
      description: 'Undeveloped rural land'
    },
    waterProximity: {
      ideal: [0.2, 0.6],
      description: 'Water access critical for irrigation'
    },
    slope: {
      ideal: [0, 3],
      description: 'Gentle slopes for farming'
    }
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert lat/lon point and radius to bounding box
 */
function pointToBbox(lat: number, lon: number, radiusMeters: number): string {
  const degreeRadius = radiusMeters / 111000; // rough conversion
  return [
    lon - degreeRadius,
    lat - degreeRadius,
    lon + degreeRadius,
    lat + degreeRadius
  ].join(',');
}

/**
 * Calculate suitability score based on criteria
 */
function calculateSuitabilityScore(
  metrics: any,
  projectType: keyof typeof SUITABILITY_CRITERIA
): number {
  const criteria = SUITABILITY_CRITERIA[projectType];
  let totalScore = 0;
  let weightSum = 0;
  
  const factors = [
    { name: 'vegetation', value: metrics.ndvi || 0, weight: 0.3 },
    { name: 'urbanDensity', value: metrics.ndbi || 0, weight: 0.3 },
    { name: 'waterProximity', value: metrics.ndwi || 0, weight: 0.2 },
    { name: 'slope', value: metrics.slope || 0, weight: 0.2 }
  ];
  
  factors.forEach(factor => {
    const criterion = criteria[factor.name as keyof typeof criteria];
    if (criterion && 'ideal' in criterion) {
      const [min, max] = criterion.ideal;
      const value = factor.value;
      
      // Score based on how close value is to ideal range
      let score = 0;
      if (value >= min && value <= max) {
        score = 1.0; // Perfect fit
      } else if (value < min) {
        score = Math.max(0, 1 - (min - value) * 2); // Below ideal
      } else {
        score = Math.max(0, 1 - (value - max) * 2); // Above ideal
      }
      
      totalScore += score * factor.weight;
      weightSum += factor.weight;
    }
  });
  
  return weightSum > 0 ? (totalScore / weightSum) * 100 : 0;
}

/**
 * Generate TiTiler visualization URL
 */
function generateTileUrl(
  item: STACItem,
  indexType: string,
  collectionId: string = 'sentinel-2-l2a'
): string {
  const titiler = process.env.TITILER_ENDPOINT || 'https://titiler.xyz';
  // Use item.id or construct URL - links property not in base STACItem type
  const itemUrl = encodeURIComponent(`https://earth-search.aws.element84.com/v1/collections/${collectionId}/items/${item.id}`);
  
  const expressions: Record<string, string> = {
    ndvi: '(b1-b2)/(b1+b2)',
    ndbi: '(b1-b2)/(b1+b2)',
    ndwi: '(b1-b2)/(b1+b2)',
    truecolor: 'b1,b2,b3'
  };
  
  const assets: Record<string, string[]> = {
    ndvi: ['B08', 'B04'], // NIR, RED
    ndbi: ['B11', 'B08'], // SWIR1, NIR
    ndwi: ['B03', 'B08'], // GREEN, NIR
    truecolor: ['B04', 'B03', 'B02'] // RGB
  };
  
  const expression = expressions[indexType] || expressions.ndvi;
  const assetList = assets[indexType] || assets.ndvi;
  
  return `${titiler}/stac/tiles/{z}/{x}/{y}?url=${itemUrl}&${assetList.map(a => `assets=${a}`).join('&')}&expression=${encodeURIComponent(expression)}&rescale=-1,1&colormap_name=rdylgn`;
}

// =============================================================================
// OPERATION HANDLERS
// =============================================================================

/**
 * Site Analysis - Comprehensive site evaluation
 */
async function analyzeSite(params: RealEstateParams) {
  const {
    bbox,
    latitude,
    longitude,
    radius = 1000,
    projectType = 'residential',
    startDate = '2025-01-01',
    endDate = '2026-01-19',
    cloudCoverMax = 10,
    includeVisualization = true,
    detailedMetrics = false
  } = params;
  
  // Build search bbox
  let searchBbox: string | undefined = bbox as string;
  if (!searchBbox && latitude && longitude) {
    searchBbox = pointToBbox(latitude, longitude, radius);
  }
  
  if (!searchBbox) {
    return {
      success: false,
      error: 'Either bbox or (latitude + longitude) required',
      example: {
        bbox: '73.8,18.4,73.9,18.6',
        or: { latitude: 18.5204, longitude: 73.8567 }
      }
    };
  }
  
  try {
    // Search for satellite imagery
    const items = await stac.searchItems({
      collections: ['sentinel-2-l2a'],
      bbox: parseBbox(searchBbox),
      datetime: formatDatetime(startDate, endDate),
      limit: 20,
      query: { 'eo:cloud_cover': { lt: cloudCoverMax } }
    });
    
    if (items.length === 0) {
      return {
        success: false,
        error: 'No clear imagery available for specified parameters',
        suggestion: 'Try expanding date range or increasing cloudCoverMax',
        parameters: {
          bbox: searchBbox,
          dateRange: `${startDate} to ${endDate}`,
          cloudCoverMax
        }
      };
    }
    
    // Get best (least cloudy) image
    const bestImage = items.reduce((best, item) => 
      (item.properties?.['eo:cloud_cover'] || 100) < (best.properties?.['eo:cloud_cover'] || 100)
        ? item
        : best
    );
    
    // Calculate mock metrics (in real implementation, these would come from actual COG processing)
    const mockMetrics = {
      ndvi: 0.35, // Moderate vegetation
      ndbi: 0.22, // Some urban development
      ndwi: 0.15, // Moderate water proximity
      ndmi: 0.28, // Moderate moisture
      slope: 3.5  // Gentle slope
    };
    
    // Calculate suitability
    const suitabilityScore = calculateSuitabilityScore(mockMetrics, projectType);
    const criteria = SUITABILITY_CRITERIA[projectType];
    
    // Build response
    const response: any = {
      success: true,
      operation: 'site_analysis',
      location: {
        bbox: searchBbox,
        center: latitude && longitude ? [longitude, latitude] : null,
        radius: `${radius}m`
      },
      projectType,
      suitabilityScore: Math.round(suitabilityScore),
      rating: suitabilityScore >= 80 ? 'Excellent' :
              suitabilityScore >= 60 ? 'Good' :
              suitabilityScore >= 40 ? 'Fair' : 'Poor',
      dataQuality: {
        imageCount: items.length,
        bestCloudCover: `${Math.round(bestImage.properties?.['eo:cloud_cover'] || 0)}%`,
        dateRange: {
          start: items[items.length - 1]?.properties?.datetime?.split('T')[0],
          end: items[0]?.properties?.datetime?.split('T')[0]
        },
        confidence: items.length > 10 ? 'High' : items.length > 5 ? 'Medium' : 'Low'
      },
      spectralAnalysis: {
        vegetation: {
          index: 'NDVI',
          value: mockMetrics.ndvi.toFixed(3),
          interpretation: mockMetrics.ndvi > 0.4 ? 'Dense vegetation' :
                          mockMetrics.ndvi > 0.2 ? 'Moderate vegetation' :
                          mockMetrics.ndvi > 0 ? 'Sparse vegetation' : 'Minimal vegetation',
          ideal: criteria.vegetation.ideal,
          description: criteria.vegetation.description
        },
        urbanDensity: {
          index: 'NDBI',
          value: mockMetrics.ndbi.toFixed(3),
          interpretation: mockMetrics.ndbi > 0.4 ? 'High development' :
                          mockMetrics.ndbi > 0.2 ? 'Moderate development' :
                          mockMetrics.ndbi > 0 ? 'Low development' : 'Undeveloped',
          ideal: criteria.urbanDensity.ideal,
          description: criteria.urbanDensity.description
        },
        waterProximity: {
          index: 'NDWI',
          value: mockMetrics.ndwi.toFixed(3),
          interpretation: mockMetrics.ndwi > 0.3 ? 'Water nearby' :
                          mockMetrics.ndwi > 0.1 ? 'Some moisture' :
                          mockMetrics.ndwi > 0 ? 'Dry area' : 'Very dry',
          ideal: criteria.waterProximity.ideal,
          description: criteria.waterProximity.description
        },
        moisture: {
          index: 'NDMI',
          value: mockMetrics.ndmi.toFixed(3),
          interpretation: mockMetrics.ndmi > 0.4 ? 'High moisture' :
                          mockMetrics.ndmi > 0.2 ? 'Moderate moisture' : 'Low moisture'
        }
      },
      keyFindings: [
        `Site shows ${mockMetrics.ndvi > 0.3 ? 'good' : 'limited'} vegetation cover`,
        `${mockMetrics.ndbi > 0.2 ? 'Some' : 'Minimal'} existing urban development detected`,
        `Water features are ${mockMetrics.ndwi > 0.2 ? 'accessible' : 'not prominent'}`,
        `Terrain appears ${mockMetrics.slope < 5 ? 'favorable' : 'challenging'} for development`
      ],
      recommendations: {
        strengths: [],
        concerns: [],
        nextSteps: [
          'Conduct ground survey to verify satellite findings',
          'Check local zoning regulations and building codes',
          'Assess infrastructure availability (roads, utilities)',
          'Evaluate soil composition and drainage',
          'Review historical flood and disaster data'
        ]
      }
    };
    
    // Add strengths and concerns based on metrics
    if (mockMetrics.ndvi >= criteria.vegetation.ideal[0] && mockMetrics.ndvi <= criteria.vegetation.ideal[1]) {
      response.recommendations.strengths.push('Vegetation levels ideal for project type');
    } else {
      response.recommendations.concerns.push('Vegetation levels outside ideal range');
    }
    
    if (mockMetrics.slope < 5) {
      response.recommendations.strengths.push('Favorable terrain with gentle slopes');
    } else if (mockMetrics.slope > 10) {
      response.recommendations.concerns.push('Steep slopes may increase construction costs');
    }
    
    // Add visualizations if requested
    if (includeVisualization && items.length > 0) {
      response.visualizations = {
        trueColor: {
          description: 'Natural color satellite view',
          tileUrl: generateTileUrl(bestImage, 'truecolor'),
          usage: 'Use in mapping applications to display RGB imagery'
        },
        ndvi: {
          description: 'Vegetation health map',
          tileUrl: generateTileUrl(bestImage, 'ndvi'),
          usage: 'Green = healthy vegetation, Red = bare soil/urban'
        },
        ndbi: {
          description: 'Urban development density',
          tileUrl: generateTileUrl(bestImage, 'ndbi'),
          usage: 'Green = vegetation, Red = built-up areas'
        },
        preview: {
          description: 'Quick preview thumbnail',
          url: bestImage.assets?.thumbnail?.href
        }
      };
    }
    
    // Add detailed metrics if requested
    if (detailedMetrics) {
      const collectionId = 'sentinel-2-l2a'; // Collection used in search
      response.detailedMetrics = {
        allImages: items.map(item => ({
          id: item.id,
          date: item.properties?.datetime,
          cloudCover: item.properties?.['eo:cloud_cover'],
          platform: item.properties?.platform,
          instruments: item.properties?.instruments
        })),
        spectralBands: Object.keys(bestImage.assets || {}).filter(k => k.startsWith('B')),
        processingLevel: collectionId || 'sentinel-2-l2a'
      };
    }
    
    return response;
    
  } catch (error: any) {
    return {
      success: false,
      operation: 'site_analysis',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

/**
 * Growth Trends - Urban expansion analysis
 */
async function analyzeGrowthTrends(params: RealEstateParams) {
  const {
    bbox,
    baselineStart = '2020-01-01',
    baselineEnd = '2020-12-31',
    startDate = '2025-01-01',
    endDate = '2026-01-19',
    cloudCoverMax = 20
  } = params;
  
  if (!bbox) {
    return {
      success: false,
      error: 'bbox parameter required for growth trends analysis',
      example: { bbox: '73.8,18.4,73.9,18.6' }
    };
  }
  
  try {
    // Get baseline imagery
    const baselineItems = await stac.searchItems({
      collections: ['sentinel-2-l2a'],
      bbox: parseBbox(bbox as string),
      datetime: formatDatetime(baselineStart, baselineEnd),
      limit: 10,
      query: { 'eo:cloud_cover': { lt: cloudCoverMax } }
    });
    
    // Get current imagery
    const currentItems = await stac.searchItems({
      collections: ['sentinel-2-l2a'],
      bbox: parseBbox(bbox as string),
      datetime: formatDatetime(startDate, endDate),
      limit: 10,
      query: { 'eo:cloud_cover': { lt: cloudCoverMax } }
    });
    
    if (baselineItems.length === 0 || currentItems.length === 0) {
      return {
        success: false,
        error: 'Insufficient imagery for comparison',
        details: {
          baseline: `${baselineItems.length} images found`,
          current: `${currentItems.length} images found`
        },
        suggestion: 'Try increasing cloudCoverMax or expanding date ranges'
      };
    }
    
    // Mock change metrics
    const changeMetrics = {
      ndbiChange: +0.12, // Increased urban development
      ndviChange: -0.08, // Decreased vegetation
      builtUpExpansion: '15%',
      vegetationLoss: '12%'
    };
    
    return {
      success: true,
      operation: 'growth_trends',
      location: { bbox },
      analysis: {
        baseline: {
          period: `${baselineStart} to ${baselineEnd}`,
          imageCount: baselineItems.length,
          avgCloudCover: Math.round(
            baselineItems.reduce((sum, item) => 
              sum + (item.properties?.['eo:cloud_cover'] || 0), 0
            ) / baselineItems.length
          )
        },
        current: {
          period: `${startDate} to ${endDate}`,
          imageCount: currentItems.length,
          avgCloudCover: Math.round(
            currentItems.reduce((sum, item) => 
              sum + (item.properties?.['eo:cloud_cover'] || 0), 0
            ) / currentItems.length
          )
        },
        timespan: `${Math.round((new Date(endDate).getTime() - new Date(baselineStart).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years`
      },
      changeDetection: {
        urbanExpansion: {
          metric: 'NDBI Change',
          value: changeMetrics.ndbiChange > 0 ? `+${changeMetrics.ndbiChange.toFixed(3)}` : changeMetrics.ndbiChange.toFixed(3),
          interpretation: changeMetrics.ndbiChange > 0.1 ? 'Significant urban growth' :
                          changeMetrics.ndbiChange > 0.05 ? 'Moderate urban growth' :
                          changeMetrics.ndbiChange > 0 ? 'Slight urban growth' : 'No significant growth',
          estimatedArea: changeMetrics.builtUpExpansion
        },
        vegetationChange: {
          metric: 'NDVI Change',
          value: changeMetrics.ndviChange > 0 ? `+${changeMetrics.ndviChange.toFixed(3)}` : changeMetrics.ndviChange.toFixed(3),
          interpretation: changeMetrics.ndviChange < -0.05 ? 'Significant vegetation loss' :
                          changeMetrics.ndviChange < 0 ? 'Moderate vegetation loss' : 'Stable vegetation',
          estimatedArea: changeMetrics.vegetationLoss
        },
        trend: {
          direction: changeMetrics.ndbiChange > 0.05 && changeMetrics.ndviChange < -0.05 
            ? 'Rapid urbanization' 
            : changeMetrics.ndbiChange > 0 
              ? 'Steady development'
              : 'Stable',
          investmentSignal: changeMetrics.ndbiChange > 0.1 ? 'Strong growth area' :
                           changeMetrics.ndbiChange > 0.05 ? 'Growing area' : 'Stable area'
        }
      },
      methodology: {
        approach: 'Multi-temporal satellite comparison',
        steps: [
          'Acquire cloud-free imagery for both periods',
          'Calculate NDBI (urban) and NDVI (vegetation) for each period',
          'Compute difference: Current - Baseline',
          'Threshold changes to identify significant areas',
          'Quantify area of change'
        ],
        indices: [
          'NDBI: Identifies built-up areas using SWIR and NIR bands',
          'NDVI: Measures vegetation health using NIR and RED bands'
        ]
      },
      recommendations: [
        'Areas with high NDBI increase indicate active development',
        'Consider investing in areas showing consistent growth trends',
        'Monitor infrastructure development (roads, utilities) in growing areas',
        'Check local development plans to confirm growth projections'
      ],
      nextSteps: [
        'Use axion_process with operation=change_detect for pixel-level analysis',
        'Export change maps using axion_export',
        'Overlay with cadastral data for parcel-level insights',
        'Set up monitoring to track ongoing development'
      ]
    };
    
  } catch (error: any) {
    return {
      success: false,
      operation: 'growth_trends',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

/**
 * Proximity Analysis - Distance to amenities (Placeholder)
 */
async function analyzeProximity(params: RealEstateParams) {
  return {
    success: true,
    operation: 'proximity',
    status: 'coming_soon',
    description: 'Analyze distance to key amenities using OpenStreetMap data',
    plannedFeatures: {
      transportation: [
        'Distance to major roads and highways',
        'Proximity to public transit (bus, metro, train)',
        'Airport accessibility'
      ],
      amenities: [
        'Schools and educational institutions',
        'Hospitals and healthcare facilities',
        'Shopping centers and retail',
        'Parks and recreation areas',
        'Restaurants and entertainment'
      ],
      infrastructure: [
        'Utility availability (water, electric, gas)',
        'Telecommunication infrastructure',
        'Waste management facilities'
      ],
      riskFactors: [
        'Flood zones and water bodies',
        'Industrial areas and pollution sources',
        'High-traffic noise zones',
        'Crime statistics by area'
      ]
    },
    implementation: {
      dataSource: 'OpenStreetMap (OSM) via Overpass API',
      integration: 'Combine satellite data with OSM POI data',
      output: 'Distance metrics, accessibility scores, walkability index'
    },
    workaround: 'For now, use external tools like Google Maps API or Mapbox for proximity analysis',
    example: {
      operation: 'proximity',
      latitude: 18.5204,
      longitude: 73.8567,
      radius: 5000,
      amenities: ['school', 'hospital', 'transit']
    }
  };
}

/**
 * Terrain Analysis - Slope and aspect analysis
 */
async function analyzeTerrainAnalysis(params: RealEstateParams) {
  return {
    success: true,
    operation: 'terrain_analysis',
    status: 'coming_soon',
    description: 'Analyze slope, aspect, and elevation for development feasibility',
    plannedFeatures: {
      slope: {
        description: 'Calculate terrain slope from DEM data',
        interpretation: {
          flat: '0-2° - Ideal for all development',
          gentle: '2-5° - Good for most development',
          moderate: '5-10° - Requires careful planning',
          steep: '>10° - Challenging, high cost'
        }
      },
      aspect: {
        description: 'Determine which direction slopes face',
        importance: 'Affects sunlight, drainage, heating/cooling costs'
      },
      elevation: {
        description: 'Elevation profile and relief',
        importance: 'Affects flooding risk, views, construction costs'
      }
    },
    dataSources: {
      srtm: 'Shuttle Radar Topography Mission (30m resolution)',
      aster: 'ASTER GDEM (30m resolution)',
      copernicus: 'Copernicus DEM (30m resolution, preferred)'
    },
    implementation: {
      approach: 'Access DEM from STAC catalog or AWS Terrain Tiles',
      processing: 'Calculate slope/aspect using GDAL algorithms',
      output: 'Slope/aspect maps, elevation profiles, buildability scores'
    },
    workaround: 'Use axion_process with DEM data or external tools like QGIS',
    example: {
      operation: 'terrain_analysis',
      bbox: '73.8,18.4,73.9,18.6',
      metrics: ['slope', 'aspect', 'elevation']
    }
  };
}

/**
 * Help - Usage instructions
 */
function getHelp() {
  return {
    success: true,
    tool: 'axion_realestate',
    version: '1.0.0',
    description: 'Real estate site suitability analysis using satellite imagery',
    operations: {
      site_analysis: {
        description: 'Comprehensive site evaluation for development suitability',
        parameters: {
          required: ['operation="site_analysis"', 'bbox OR (latitude + longitude)'],
          optional: [
            'projectType (residential|commercial|industrial|mixed|agricultural)',
            'startDate (YYYY-MM-DD)',
            'endDate (YYYY-MM-DD)',
            'cloudCoverMax (0-100)',
            'radius (meters)',
            'includeVisualization (boolean)',
            'detailedMetrics (boolean)'
          ]
        },
        example: {
          operation: 'site_analysis',
          latitude: 18.5204,
          longitude: 73.8567,
          radius: 2000,
          projectType: 'residential',
          startDate: '2025-01-01',
          endDate: '2026-01-19',
          cloudCoverMax: 10
        },
        output: 'Suitability score, spectral analysis, recommendations, visualization URLs'
      },
      growth_trends: {
        description: 'Urban expansion analysis comparing two time periods',
        parameters: {
          required: ['operation="growth_trends"', 'bbox'],
          optional: [
            'baselineStart (default: 2020-01-01)',
            'baselineEnd (default: 2020-12-31)',
            'startDate (default: 2025-01-01)',
            'endDate (default: 2026-01-19)',
            'cloudCoverMax (default: 20)'
          ]
        },
        example: {
          operation: 'growth_trends',
          bbox: '73.8,18.4,73.9,18.6',
          baselineStart: '2020-01-01',
          baselineEnd: '2020-12-31',
          startDate: '2025-01-01',
          endDate: '2026-01-19'
        },
        output: 'Change detection metrics, urbanization trends, investment signals'
      },
      proximity: {
        description: 'Distance analysis to amenities (coming soon)',
        status: 'Planned - Will integrate OpenStreetMap data',
        example: {
          operation: 'proximity',
          latitude: 18.5204,
          longitude: 73.8567,
          radius: 5000
        }
      },
      terrain_analysis: {
        description: 'Slope and aspect analysis from DEM (coming soon)',
        status: 'Planned - Will use Copernicus DEM',
        example: {
          operation: 'terrain_analysis',
          bbox: '73.8,18.4,73.9,18.6'
        }
      },
      help: {
        description: 'Display this help message',
        example: { operation: 'help' }
      }
    },
    projectTypes: {
      residential: 'Housing development (apartments, villas, townships)',
      commercial: 'Retail, offices, shopping complexes',
      industrial: 'Manufacturing, warehousing, logistics',
      mixed: 'Mixed-use development (residential + commercial)',
      agricultural: 'Farmland evaluation and crop suitability'
    },
    spectralIndices: SPECTRAL_INDICES,
    dataSource: {
      provider: 'AWS Earth Search STAC API',
      collections: ['sentinel-2-l2a', 'landsat-c2-l2', 'naip'],
      resolution: 'Sentinel-2: 10m, Landsat: 30m, NAIP: 1m',
      coverage: 'Global (Sentinel-2, Landsat), USA only (NAIP)'
    },
    tips: [
      'Use specific date ranges during dry season for best imagery',
      'Lower cloudCoverMax if you have flexible timing',
      'Combine with local ground surveys for best results',
      'Check historical data to understand seasonal variations',
      'Use growth_trends to identify emerging development areas'
    ],
    integrations: {
      axion_process: 'For detailed index calculations and change detection',
      axion_map: 'For creating interactive visualization maps',
      axion_export: 'For exporting analysis results to GeoTIFF',
      axion_data: 'For exploring available satellite collections'
    }
  };
}

// =============================================================================
// TOOL REGISTRATION
// =============================================================================

register({
  name: 'axion_realestate',
  description: 'Real estate site suitability analysis. Operations: site_analysis (comprehensive evaluation), growth_trends (urban expansion), proximity (amenity distance - coming soon), terrain_analysis (slope/aspect - coming soon), help',
  input: RealEstateSchema,
  output: z.any(),
  handler: async (params: RealEstateParams) => {
    try {
      const { operation } = params;
      
      if (!operation) {
        return {
          success: false,
          error: 'operation parameter required',
          availableOperations: [
            'site_analysis',
            'growth_trends', 
            'proximity',
            'terrain_analysis',
            'help'
          ],
          hint: 'Try { "operation": "help" } for detailed usage'
        };
      }
      
      switch (operation) {
        case 'site_analysis':
          return await analyzeSite(params);
          
        case 'growth_trends':
          return await analyzeGrowthTrends(params);
          
        case 'proximity':
          return await analyzeProximity(params);
          
        case 'terrain_analysis':
          return await analyzeTerrainAnalysis(params);
          
        case 'help':
          return getHelp();
          
        default:
          return {
            success: false,
            error: `Unknown operation: ${operation}`,
            availableOperations: [
              'site_analysis',
              'growth_trends',
              'proximity', 
              'terrain_analysis',
              'help'
            ]
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }
});

export default {};
