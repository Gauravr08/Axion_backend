import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

export function initializeSentry() {
  const sentryDsn = process.env.SENTRY_DSN;

  if (!sentryDsn || sentryDsn.trim() === "") {
    console.log("⚠️  Sentry DSN not configured. Error tracking disabled.");
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || "development",

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Set profilesSampleRate to 1.0 to profile every transaction.
    // Since profilesSampleRate is relative to tracesSampleRate,
    // the final profiling rate can be computed as tracesSampleRate * profilesSampleRate
    // For example, a tracesSampleRate of 0.5 and profilesSampleRate of 0.5 would
    // results in 25% of transactions being profiled (0.5*0.5=0.25)
    profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    integrations: [
      // Profiling integration
      nodeProfilingIntegration(),
    ],

    // Filter sensitive data
    beforeSend(event, hint) {
      // Don't send events in development unless explicitly enabled
      if (
        process.env.NODE_ENV === "development" &&
        !process.env.SENTRY_DEV_ENABLED
      ) {
        return null;
      }

      // Remove sensitive data from request
      if (event.request) {
        delete event.request.cookies;

        if (event.request.headers) {
          delete event.request.headers["x-api-key"];
          delete event.request.headers["authorization"];
        }
      }

      return event;
    },

    // Ignore specific errors
    ignoreErrors: [
      "UnauthorizedException",
      "NotFoundException",
      "BadRequestException",
    ],
  });

  console.log("✅ Sentry error tracking initialized");
}

export { Sentry };
