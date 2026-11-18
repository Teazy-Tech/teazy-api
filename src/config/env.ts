import { z } from "zod";

const csvToArray = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const postgresUrl = z
  .string()
  .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
    message: "must start with postgres:// or postgresql://",
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: csvToArray,
  DATABASE_URL: postgresUrl,
  SEED_PASSWORD: z.string().min(1).optional(),
  SUPABASE_URL: z.url(),
  SUPABASE_JWKS_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_WEBHOOK_HASH: z.string().min(1).optional(),
  SENTRY_DSN: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the process environment. Called once at startup; throws with a
 * readable list of every problem so a misconfigured deploy fails immediately.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= loadEnv();
  return cached;
}
