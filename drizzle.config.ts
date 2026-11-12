import { defineConfig } from "drizzle-kit";

// The schema lives in code (src/db/schema) and migrations are generated from it.
// API-03: run `pnpm db:pull` once against staging to create the baseline (0000).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
