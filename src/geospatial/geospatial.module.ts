import { Module, forwardRef } from "@nestjs/common";
import { GeospatialController } from "./geospatial.controller";
import { GeospatialService } from "./geospatial.service";
import { TasksModule } from "../tasks/tasks.module";

@Module({
  imports: [forwardRef(() => TasksModule)],
  controllers: [GeospatialController],
  providers: [GeospatialService],
  exports: [GeospatialService],
})
export class GeospatialModule {}
