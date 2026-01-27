import * as Joi from "joi";

export const configValidationSchema = Joi.object({
  // Environment
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3001),

  // OpenRouter
  OPENROUTER_API_KEY: Joi.string().required(),
  OPENROUTER_MODEL: Joi.string().required(),

  // MCP Configuration
  MCP_MODE: Joi.string().valid("remote", "local").required(),
  MCP_REMOTE_URL: Joi.string().uri().when("MCP_MODE", {
    is: "remote",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  MCP_API_KEY: Joi.string().optional(),
  MCP_SERVER_PATH: Joi.string().when("MCP_MODE", {
    is: "local",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // API Authentication
  API_KEYS: Joi.string()
    .required()
    .custom((value, helpers) => {
      const keys = value.split(",").map((k: string) => k.trim());
      if (keys.length === 0) {
        return helpers.error("API_KEYS must contain at least one key");
      }
      if (keys.some((k: string) => k.length < 16)) {
        return helpers.error(
          "API keys must be at least 16 characters long for security",
        );
      }
      return value;
    }),

  // Database
  DATABASE_URL: Joi.string().uri().optional().allow(""),

  // CORS
  ALLOWED_ORIGINS: Joi.string().default(
    "http://localhost:3000,http://localhost:3001",
  ),

  // Monitoring
  SENTRY_DSN: Joi.string().uri().optional().allow(""),

  // Application
  APP_URL: Joi.string().uri().default("http://localhost:3001"),

  // Redis (optional)
  UPSTASH_REDIS_URL: Joi.string().uri().optional().allow(""),
  UPSTASH_REDIS_TOKEN: Joi.string().optional().allow(""),
});
