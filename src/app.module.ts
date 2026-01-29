import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { GeospatialModule } from "./geospatial/geospatial.module";
import { DatabaseModule } from "./database/database.module";
import { LoggingModule } from "./logging/logging.module";
import { TasksModule } from "./tasks/tasks.module";
import { CachingModule } from "./cache/cache.module";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { CacheControlInterceptor } from "./interceptors/cache-control.interceptor";
import { configValidationSchema } from "./config/configuration";

@Module({
  imports: [
    // Configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      validationSchema: configValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60000, // 1 minute
        limit: 20, // 20 requests per minute per IP
      },
      {
        name: "strict",
        ttl: 60000, // 1 minute
        limit: 10, // 10 requests per minute for analysis endpoints
      },
    ]),

    LoggingModule,
    DatabaseModule,
    CachingModule,
    TasksModule,
    GeospatialModule,
  ],
  providers: [
    // Global API key guard
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global cache control interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheControlInterceptor,
    },
  ],
})
export class AppModule {}
