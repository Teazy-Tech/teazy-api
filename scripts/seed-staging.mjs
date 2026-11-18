#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const { DATABASE_URL, NODE_ENV, SEED_PASSWORD } = process.env;

if (NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV is production.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

if (!SEED_PASSWORD) {
  console.error(
    "SEED_PASSWORD is not set. Use the synthetic demo password from the password manager.",
  );
  process.exit(1);
}

const seedFile = path.join(root, "src", "db", "seed", "staging-demo.sql");
const result = spawnSync(
  "psql",
  [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-v", `seed_password=${SEED_PASSWORD}`, "-f", seedFile],
  { stdio: "inherit" },
);

if (result.error?.code === "ENOENT") {
  console.error("psql was not found on PATH. Install the PostgreSQL client and retry.");
  process.exit(1);
}

if (result.status !== 0) {
  console.error("Seeding failed.");
  process.exit(result.status ?? 1);
}

console.log("Staging seed applied.");
