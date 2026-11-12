import { defineConfig } from "vitest/config";

// Unit tests: src/**/*.test.ts (services, middleware, core). No network, no database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    coverage: { provider: "v8", include: ["src/**/*.ts"] },
  },
});
