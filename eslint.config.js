// @ts-check
import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Layer rules (README.md §2, "Architecture rules"). Requests flow one way:
 *   routes -> controller -> service -> repository -> db
 * Folders are "elements"; inside a module, the layer is the file-name suffix
 * ("file categories"). A failing `boundaries/dependencies` error means an
 * import crosses a layer it must not. Fix the import instead of disabling it.
 */
const layer = (category) => ({ file: { categories: category } });

const layers = {
  files: ["src/**/*.ts"],
  plugins: { boundaries },
  settings: {
    "import/resolver": { typescript: { project: "./tsconfig.check.json" } },
    "boundaries/elements": [
      { type: "module", pattern: "src/modules/*", capture: ["module"] },
      { type: "core", pattern: "src/core" },
      { type: "config", pattern: "src/config" },
      { type: "middleware", pattern: "src/middleware" },
      { type: "ai", pattern: "src/ai" },
      { type: "integrations", pattern: "src/integrations" },
      { type: "db", pattern: "src/db" },
      { type: "jobs", pattern: "src/jobs" },
      { type: "openapi", pattern: "src/openapi" },
    ],
    "boundaries/files": [
      { pattern: "**/*.routes.ts", category: "routes" },
      { pattern: "**/*.controller.ts", category: "controller" },
      { pattern: "**/*.service.ts", category: "service" },
      { pattern: "**/*.repository.ts", category: "repository" },
      { pattern: "src/modules/*/index.ts", category: "public" },
    ],
  },
  rules: {
    "boundaries/dependencies": [
      2,
      {
        default: "disallow",
        checkInternals: true,
        policies: [
          // Inside the same element (one module, or core, ai, ...) imports are allowed,
          // except against the request direction (disallow rules further down; the last matching policy wins).
          { allow: { dependency: { relationship: { to: "internal" } } } },
          // Everyone may use core helpers and validated config. core imports nothing.
          {
            from: {
              element: {
                types: ["module", "middleware", "ai", "integrations", "db", "jobs", "openapi"],
              },
            },
            allow: { to: { element: { types: ["core", "config"] } } },
          },
          { from: { element: { type: "config" } }, allow: { to: { element: { type: "core" } } } },

          // Another module is reachable only through its public index.ts.
          {
            from: { element: { types: ["module", "jobs", "openapi"] } },
            allow: { to: { element: { type: "module" }, ...layer("public") } },
          },

          // Layer-specific outgoing dependencies.
          { from: { ...layer("routes") }, allow: { to: { element: { type: "middleware" } } } },
          {
            from: { ...layer("service") },
            allow: { to: { element: { types: ["ai", "integrations", "jobs"] } } },
          },
          { from: { ...layer("repository") }, allow: { to: { element: { type: "db" } } } },
          {
            from: { element: { type: "middleware" } },
            allow: { to: { element: { types: ["db", "integrations"] } } },
          },
          { from: { element: { type: "ai" } }, allow: { to: { element: { type: "db" } } } },
          { from: { element: { type: "jobs" } }, allow: { to: { element: { type: "db" } } } },

          // Against the request direction, even inside one module. Listed last so they win.
          {
            from: { ...layer("routes") },
            disallow: { to: { ...layer(["service", "repository"]) } },
            message: "routes may only call the controller",
          },
          {
            from: { ...layer("controller") },
            disallow: {
              to: [
                { ...layer(["repository", "routes"]) },
                { element: { types: ["db", "ai", "integrations"] } },
              ],
            },
            message: "controllers call one service method; no database, AI or integrations",
          },
          {
            from: { ...layer("service") },
            disallow: { to: { ...layer(["controller", "routes"]) } },
            message: "services never touch HTTP",
          },
          {
            from: { ...layer("repository") },
            disallow: { to: { ...layer(["service", "controller", "routes"]) } },
            message: "repositories only query the database",
          },
        ],
      },
    ],
    // Services must not depend on Express (no req/res outside routes/controllers/middleware).
    "no-restricted-imports": "off",
  },
};

const noExpressInServices = {
  files: ["src/modules/**/*.service.ts", "src/modules/**/*.repository.ts", "src/core/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          { name: "express", message: "Services, repositories and core never import Express." },
        ],
      },
    ],
  },
};

export default defineConfig([
  globalIgnores(["dist/**", "coverage/**", "openapi/**", "src/db/migrations/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Use the pino logger from core/logger.ts instead.
      "no-console": "error",
    },
  },
  layers,
  noExpressInServices,
]);
