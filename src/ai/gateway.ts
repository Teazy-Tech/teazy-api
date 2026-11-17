import { AiError, toAiError, type AttemptFailure } from "./errors.js";
import { AI_ROUTES, type AiRoutes, type AiTask, type TaskRoute } from "./routes.config.js";
import type {
  GenerateRequest,
  LlmProvider,
  ModelRef,
  ProviderName,
  ProviderResponse,
} from "./types.js";

/**
 * The only entry point for AI calls (README rule 6). Services ask for a task;
 * the gateway picks the model from `routes.config.ts`, applies the timeout and
 * falls back to the second model when the first one fails.
 */

export interface GenerateOptions {
  /** Cancels the whole call, including the fallback. */
  signal?: AbortSignal;
}

export interface GenerateResult extends ProviderResponse {
  task: AiTask;
  provider: ProviderName;
  model: string;
  /** True when the primary failed and the fallback answered. */
  usedFallback: boolean;
  /** Failures before the answer (empty when the primary answered). */
  failures: AttemptFailure[];
}

/**
 * Emitted once per model attempt. Carries no prompt, output or student data,
 * so it is safe to log and, later, to meter (AI-02).
 */
export interface AttemptEvent {
  task: AiTask;
  provider: ProviderName;
  model: string;
  role: "primary" | "fallback";
  ok: boolean;
  durationMs: number;
  errorCode?: AttemptFailure["code"];
  status?: number;
}

export interface AiGatewayDeps {
  providers: Partial<Record<ProviderName, LlmProvider>>;
  routes?: AiRoutes;
  onAttempt?: (event: AttemptEvent) => void;
  now?: () => number;
}

export interface AiGateway {
  generate(
    task: AiTask,
    request: GenerateRequest,
    options?: GenerateOptions,
  ): Promise<GenerateResult>;
}

function abortReason(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function callWithTimeout(
  provider: LlmProvider,
  ref: ModelRef,
  route: TaskRoute,
  request: GenerateRequest,
  outer: AbortSignal | undefined,
): Promise<ProviderResponse> {
  const controller = new AbortController();
  const timeout = new AiError("TIMEOUT", `${ref.provider}/${ref.model} timed out`, ref);
  const timer = setTimeout(() => controller.abort(timeout), route.timeoutMs);
  const onOuterAbort = () =>
    controller.abort(new AiError("ABORTED", "request cancelled by caller", ref));
  if (outer?.aborted) onOuterAbort();
  outer?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    // Race against the abort so a provider that ignores the signal still times out.
    return await Promise.race([
      provider.generate({
        ...request,
        model: ref.model,
        maxOutputTokens: request.maxOutputTokens ?? route.maxOutputTokens,
        signal: controller.signal,
      }),
      abortReason(controller.signal),
    ]);
  } catch (err) {
    if (controller.signal.aborted && controller.signal.reason instanceof AiError) {
      throw controller.signal.reason;
    }
    throw toAiError(err, ref);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}

export function createAiGateway(deps: AiGatewayDeps): AiGateway {
  const routes = deps.routes ?? AI_ROUTES;
  const now = deps.now ?? (() => Date.now());

  async function generate(
    task: AiTask,
    request: GenerateRequest,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const route = routes[task];
    const candidates: Array<{ ref: ModelRef; role: "primary" | "fallback" }> = [
      { ref: route.primary, role: "primary" },
      { ref: route.fallback, role: "fallback" },
    ];
    const failures: AttemptFailure[] = [];

    for (const { ref, role } of candidates) {
      const provider = deps.providers[ref.provider];
      const started = now();
      try {
        if (!provider) {
          throw new AiError("NOT_CONFIGURED", `${ref.provider} is not configured`, ref);
        }
        const response = await callWithTimeout(provider, ref, route, request, options.signal);
        deps.onAttempt?.({ task, ...ref, role, ok: true, durationMs: now() - started });
        return {
          ...response,
          task,
          provider: ref.provider,
          model: ref.model,
          usedFallback: role === "fallback",
          failures,
        };
      } catch (err) {
        const error = toAiError(err, ref);
        deps.onAttempt?.({
          task,
          ...ref,
          role,
          ok: false,
          durationMs: now() - started,
          errorCode: error.code,
          status: error.status,
        });
        // A cancelled request stops here; everything else moves on to the fallback.
        if (error.code === "ABORTED") throw error;
        failures.push({
          provider: ref.provider,
          model: ref.model,
          code: error.code,
          status: error.status,
        });
      }
    }

    throw new AiError("PROVIDER_UNAVAILABLE", `every model for ${task} failed`, {
      attempts: failures,
    });
  }

  return { generate };
}
