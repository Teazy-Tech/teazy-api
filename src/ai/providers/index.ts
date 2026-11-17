import type { LlmProvider, ProviderName } from "../types.js";
import { createGeminiProviderFromKey } from "./gemini.js";
import { createOpenAiProviderFromKey } from "./openai.js";

export interface ProviderKeys {
  geminiApiKey?: string;
  openaiApiKey?: string;
}

/**
 * Builds an adapter for every provider that has a key. A provider without a
 * key is left out; the gateway then reports NOT_CONFIGURED for it and moves
 * on to the fallback. Keys come from `config/env.ts` once API-01 adds it.
 */
export function createProviders(keys: ProviderKeys): Partial<Record<ProviderName, LlmProvider>> {
  const providers: Partial<Record<ProviderName, LlmProvider>> = {};
  if (keys.geminiApiKey) providers.gemini = createGeminiProviderFromKey(keys.geminiApiKey);
  if (keys.openaiApiKey) providers.openai = createOpenAiProviderFromKey(keys.openaiApiKey);
  return providers;
}
