import { Module } from '@nestjs/common';
import { GeospatialController } from './geospatial.controller';
import { GeospatialService } from './geospatial.service';

@Module({
  controllers: [GeospatialController],
  providers: [GeospatialService],
})
export class GeospatialModule {}
