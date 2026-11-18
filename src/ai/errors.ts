import type { ProviderName } from "./types.js";

/**
 * Typed errors for the AI layer. Messages are safe to log: they never contain
 * prompts, student text, model output or keys. The original error (if any) is
 * kept on `cause` for debugging only.
 */
export type AiErrorCode =
  /** The provider did not answer within the route's timeout. */
  | "TIMEOUT"
  /** The provider returned 429. */
  | "RATE_LIMITED"
  /** 5xx, network failure or an unknown provider error. */
  | "UNAVAILABLE"
  /** 401/403: missing, wrong or revoked key. */
  | "AUTH_FAILED"
  /** 400/404/422: the provider rejected the request (bad model id, bad parameter). */
  | "BAD_REQUEST"
  /** The provider refused or filtered the content. */
  | "CONTENT_BLOCKED"
  /** The provider answered with no text. */
  | "EMPTY_RESPONSE"
  /** No adapter is configured for this provider (for example, no API key). */
  | "NOT_CONFIGURED"
  /** The caller cancelled the request. */
  | "ABORTED"
  /** Output did not match the expected schema, even after repair and one retry. */
  | "INVALID_OUTPUT"
  /** Every model on the route failed. Maps to the API error code PROVIDER_UNAVAILABLE. */
  | "PROVIDER_UNAVAILABLE";

export interface AttemptFailure {
  provider: ProviderName;
  model: string;
  code: AiErrorCode;
  status?: number;
}

interface AiErrorOptions {
  provider?: ProviderName;
  model?: string;
  status?: number;
  attempts?: AttemptFailure[];
  issues?: string[];
  cause?: unknown;
}

export class AiError extends Error {
  override readonly name = "AiError";
  readonly code: AiErrorCode;
  readonly provider?: ProviderName;
  readonly model?: string;
  readonly status?: number;
  /** Every failed attempt, for PROVIDER_UNAVAILABLE. */
  readonly attempts: AttemptFailure[];
  /** Schema problems, for INVALID_OUTPUT (paths and messages, no values). */
  readonly issues: string[];

  constructor(code: AiErrorCode, message: string, options: AiErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.provider = options.provider;
    this.model = options.model;
    this.status = options.status;
    this.attempts = options.attempts ?? [];
    this.issues = options.issues ?? [];
  }
}

export function isAiError(value: unknown): value is AiError {
  return value instanceof AiError;
}

function readStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export function codeForStatus(status: number): AiErrorCode {
  if (status === 429) return "RATE_LIMITED";
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status >= 500) return "UNAVAILABLE";
  if (status >= 400) return "BAD_REQUEST";
  return "UNAVAILABLE";
}

/**
 * Turns anything a provider SDK throws into an AiError. Both vendor SDKs put
 * the HTTP status on `status`; anything without one is treated as a network
 * failure.
 */
export function toAiError(
  err: unknown,
  context: { provider: ProviderName; model: string },
): AiError {
  if (err instanceof AiError) return err;
  const status = readStatus(err);
  const code = status === undefined ? "UNAVAILABLE" : codeForStatus(status);
  const where = `${context.provider}/${context.model}`;
  const message =
    status === undefined
      ? `${where} request failed`
      : `${where} request failed with status ${status}`;
  return new AiError(code, message, { ...context, status, cause: err });
}
