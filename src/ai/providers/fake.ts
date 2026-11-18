import { AiError } from "../errors.js";
import type { LlmProvider, ProviderName, ProviderRequest, ProviderResponse } from "../types.js";

/**
 * Scripted provider for tests and local development without keys.
 * Each call takes the next step: a text answer, an error to throw, "hang"
 * (never answers until aborted) or a function of the request.
 */
export type FakeStep =
  | string
  | AiError
  | "hang"
  | ((request: ProviderRequest) => ProviderResponse | Promise<ProviderResponse>);

export interface FakeProvider extends LlmProvider {
  readonly calls: ProviderRequest[];
}

export function createFakeProvider(name: ProviderName, steps: FakeStep[]): FakeProvider {
  const calls: ProviderRequest[] = [];
  let next = 0;
  return {
    name,
    calls,
    async generate(request) {
      calls.push(request);
      const step = steps[Math.min(next, steps.length - 1)];
      next += 1;
      if (step === undefined) {
        throw new AiError("UNAVAILABLE", `fake ${name} has no scripted answer`, { provider: name });
      }
      if (step === "hang") {
        return new Promise<ProviderResponse>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      }
      if (step instanceof AiError) throw step;
      if (typeof step === "function") return step(request);
      return { text: step, usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}
