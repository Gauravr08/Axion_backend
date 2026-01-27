import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { GeospatialModule } from "./geospatial/geospatial.module";
import { DatabaseModule } from "./database/database.module";
import { ApiKeyGuard } from "./guards/api-key.guard";
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

    DatabaseModule,
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
  ],
})
export class AppModule {}
