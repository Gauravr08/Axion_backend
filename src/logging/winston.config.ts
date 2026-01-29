import { WinstonModuleOptions } from "nest-winston";
import * as winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import * as path from "path";

// Custom format for console output with colors
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
    let logMessage = `[${timestamp}] ${level}`;

    if (context) {
      logMessage += ` [${context}]`;
    }

    logMessage += `: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }

    return logMessage;
  }),
);

// JSON format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), "logs");

export const winstonConfig: WinstonModuleOptions = {
  transports: [
    // Console transport for development
    new winston.transports.Console({
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      format: consoleFormat,
    }),

    // Rotating file transport for all logs
    new DailyRotateFile({
      dirname: logsDir,
      filename: "application-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d", // Keep logs for 14 days
      level: "info",
      format: fileFormat,
    }),

    // Rotating file transport for errors only
    new DailyRotateFile({
      dirname: logsDir,
      filename: "error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d", // Keep error logs for 30 days
      level: "error",
      format: fileFormat,
    }),

    // Rotating file transport for HTTP requests
    new DailyRotateFile({
      dirname: logsDir,
      filename: "http-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "50m",
      maxFiles: "7d", // Keep HTTP logs for 7 days
      level: "http",
      format: fileFormat,
    }),
  ],

  // Handle unhandled rejections
  exceptionHandlers: [
    new DailyRotateFile({
      dirname: logsDir,
      filename: "exceptions-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d",
      format: fileFormat,
    }),
  ],

  // Handle unhandled promise rejections
  rejectionHandlers: [
    new DailyRotateFile({
      dirname: logsDir,
      filename: "rejections-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d",
      format: fileFormat,
    }),
  ],
};
