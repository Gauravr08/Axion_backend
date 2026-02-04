/**
 * Satellite Processing Module
 * Independent module for satellite imagery analysis
 * Eliminates dependency on external MCP services
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SatelliteProcessingService } from './satellite-processing.service';
import { StacService } from './stac.service';
import { CogProcessorService } from './processors/cog-processor.service';

@Module({
  imports: [ConfigModule],
  providers: [SatelliteProcessingService, StacService, CogProcessorService],
  exports: [SatelliteProcessingService, StacService, CogProcessorService],
})
export class SatelliteProcessingModule {}
