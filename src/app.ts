import express, { type Express } from "express";
import { createLogger, type Logger } from "./core/logger.js";

export type ReadinessCheck = () => Promise<boolean>;

export interface AppOptions {
  logger?: Logger;
  readiness?: ReadinessCheck;
}

const readinessTimeoutMs = 2_000;

/**
 * Builds the Express app. Kept free of side effects (no listen, no DB connect)
 * so tests can import it with supertest.
 *
 * The global middleware chain (requestContext, security, rawBody webhooks,
 * json limits, /api/v1 module routers, notFound, errorHandler) is added in
 * API-02; see README.md §4.
 */
export function createApp(options: AppOptions = {}): Express {
  const logger = options.logger ?? createLogger({ level: "silent" });
  const { readiness } = options;

  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/readyz", async (_req, res) => {
    const ready = readiness !== undefined && (await settleWithin(readiness(), readinessTimeoutMs));

    if (!ready) {
      logger.warn("readiness check failed");
      res.status(503).json({ status: "unavailable" });
      return;
    }

    res.json({ status: "ready" });
  });

  return app;
}

async function settleWithin(promise: Promise<boolean>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
