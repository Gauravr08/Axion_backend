import { Module, forwardRef } from "@nestjs/common";
import { GeospatialController } from "./geospatial.controller";
import { GeospatialService } from "./geospatial.service";
import { TasksModule } from "../tasks/tasks.module";
import { SatelliteProcessingModule } from "../satellite-processing/satellite-processing.module";
import { JobsModule } from "../jobs/jobs.module";
import { RateLimitGuard } from "../guards/rate-limit.guard";

@Module({
  imports: [
    forwardRef(() => TasksModule),
    SatelliteProcessingModule,
    JobsModule.forRoot(),
  ],
  controllers: [GeospatialController],
  providers: [GeospatialService, RateLimitGuard],
  exports: [GeospatialService],
})
export class GeospatialModule {}
