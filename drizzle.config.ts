/// <reference types="node" />
import { defineConfig } from "drizzle-kit";
import { getEnv } from "./src/config/env.js";

// drizzle-kit runs outside the tsx scripts, so load `.env` here. The values are
// still read only through src/config/env.ts (README §2, rule 8).
try {
  process.loadEnvFile();
} catch {
  // No local .env: CI and containers provide the real environment.
}

const { DATABASE_URL } = getEnv();

// The schema lives in code (src/db/schema) and migrations are generated from it.
// API-03: the pulled schema is the baseline (0000); legacy histories stay frozen.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dbCredentials: { url: DATABASE_URL },
  strict: true,
  verbose: true,
});
