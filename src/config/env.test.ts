import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const required = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/teazy",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_JWKS_URL: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("loadEnv", () => {
  it("applies defaults and splits CORS origins", () => {
    const env = loadEnv({
      ...required,
      CORS_ORIGINS: "http://localhost:3000, https://app.example.com",
    });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(4000);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000", "https://app.example.com"]);
  });

  it("coerces PORT and accepts an empty CORS list", () => {
    const env = loadEnv({ ...required, PORT: "4100", CORS_ORIGINS: "" });

    expect(env.PORT).toBe(4100);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it("lists every missing or invalid value in the error", () => {
    expect(() => loadEnv({ DATABASE_URL: "mysql://nope" })).toThrow(
      /DATABASE_URL: must start with postgres/,
    );
    expect(() => loadEnv({})).toThrow(/SUPABASE_URL/);
  });
});
