import express, { type Express } from "express";

/**
 * Builds the Express app. Kept free of side effects (no listen, no DB connect)
 * so tests can import it with supertest.
 *
 * Phase 0 skeleton: only /healthz. The global middleware chain (requestContext,
 * security, rawBody webhooks, json limits, /api/v1 module routers, notFound,
 * errorHandler) is added in API-01/API-02; see README.md §4.
 */
export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
