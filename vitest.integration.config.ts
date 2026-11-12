import { defineConfig } from "vitest/config";

// Integration tests: real Postgres started by Testcontainers (requires Docker).
// See test/integration/README.md.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
