import postgres from "postgres";
import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { createLogger } from "./core/logger.js";

const env = getEnv();
const logger = createLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === "development",
});

const sql = postgres(env.DATABASE_URL, {
  max: 2,
  connect_timeout: 5,
  idle_timeout: 20,
});

const app = createApp({
  logger,
  readiness: async () => {
    await sql`select 1`;
    return true;
  },
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "teazy-api listening");
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "shutting down");

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "http server close failed");
    }
    void sql
      .end({ timeout: 5 })
      .catch((closeError: unknown) => logger.error({ err: closeError }, "database close failed"))
      .finally(() => process.exit(error ? 1 : 0));
  });

  setTimeout(() => {
    logger.error("shutdown timed out");
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
