import { Module, forwardRef } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DataRetentionService } from "./data-retention.service";
import { MetricsService } from "./metrics.service";
import { GeospatialModule } from "../geospatial/geospatial.module";

@Module({
  imports: [ScheduleModule.forRoot(), forwardRef(() => GeospatialModule)],
  providers: [DataRetentionService, MetricsService],
  exports: [DataRetentionService, MetricsService],
})
export class TasksModule {}
