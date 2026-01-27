import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Base class for application errors
 */
export class AppError extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    public readonly isOperational: boolean = true,
  ) {
    super(message, statusCode);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * OpenRouter API errors
 */
export class OpenRouterError extends AppError {
  constructor(
    message: string,
    public readonly statusCode: HttpStatus = HttpStatus.BAD_GATEWAY,
  ) {
    super(message, statusCode, true);
  }
}

/**
 * MCP connection errors
 */
export class McpConnectionError extends AppError {
  constructor(message: string) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, true);
  }
}

/**
 * Tool execution errors
 */
export class ToolExecutionError extends AppError {
  constructor(
    message: string,
    public readonly toolName?: string,
  ) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, true);
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends AppError {
  constructor(
    message: string = "Request timeout",
    public readonly timeoutMs?: number,
  ) {
    super(message, HttpStatus.REQUEST_TIMEOUT, true);
  }
}

/**
 * Rate limit errors
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = "Rate limit exceeded",
    public readonly retryAfter?: number,
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, true);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, HttpStatus.BAD_REQUEST, true);
  }
}
