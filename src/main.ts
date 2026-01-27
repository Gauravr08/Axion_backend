import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS configuration from environment
  const allowedOrigins = configService
    .get<string>("ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim()) || ["http://localhost:3000"];

  app.enableCors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  });

  logger.log(`✅ CORS enabled for origins: ${allowedOrigins.join(", ")}`);

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle("Axion Geospatial API")
    .setDescription(
      "Backend API for geospatial analysis using satellite imagery, NDVI, NDBI, NDWI indices, and AI-powered natural language queries via OpenRouter and MCP server.",
    )
    .setVersion("1.0")
    .addTag(
      "Geospatial Analysis",
      "Endpoints for analyzing satellite data and geospatial queries",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "x-api-key",
        in: "header",
        description: "API key for authentication",
      },
      "api-key",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    customSiteTitle: "Axion API Docs",
    customfavIcon: "https://nestjs.com/img/logo-small.svg",
    customCss: ".swagger-ui .topbar { display: none }",
  });

  const port = configService.get("PORT") || 3001;
  const env = configService.get("NODE_ENV") || "development";

  await app.listen(port);

  logger.log(`\n🚀 Axion Backend API running on: http://localhost:${port}`);
  logger.log(`📚 Swagger API Docs: http://localhost:${port}/api/docs`);
  logger.log(
    `📡 Test endpoint: POST http://localhost:${port}/api/geospatial/analyze`,
  );
  logger.log(
    `💚 Health check: GET http://localhost:${port}/api/geospatial/health`,
  );
  logger.log(`🔒 Environment: ${env}`);
  logger.log(`🔑 API Key auth: ENABLED\n`);
}
bootstrap();
