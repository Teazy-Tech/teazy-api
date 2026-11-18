import {
  GoogleGenAI,
  type Content,
  type GenerateContentParameters,
  type Part,
} from "@google/genai";
import { AiError, toAiError } from "../errors.js";
import type { ChatMessage, LlmProvider, ProviderRequest, ProviderResponse } from "../types.js";

/** The part of the Gemini SDK this adapter uses. Tests pass a fake. */
export interface GeminiClient {
  models: {
    generateContent(params: GenerateContentParameters): Promise<GeminiResponse>;
  };
}

interface GeminiResponse {
  text?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  candidates?: Array<{ finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

const BLOCKED_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
]);

function toParts(content: ChatMessage["content"]): Part[] {
  if (typeof content === "string") return [{ text: content }];
  return content.map((part) =>
    part.type === "text"
      ? { text: part.text }
      : { inlineData: { mimeType: part.mimeType, data: part.dataBase64 } },
  );
}

function textOf(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/** System messages become `systemInstruction`; assistant turns use Gemini's "model" role. */
export function toGeminiParams(request: ProviderRequest): GenerateContentParameters {
  const system = request.messages
    .filter((m) => m.role === "system")
    .map((m) => textOf(m.content))
    .join("\n\n");
  const contents: Content[] = request.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: toParts(m.content) }));

  const format = request.responseFormat;
  return {
    model: request.model,
    contents,
    config: {
      ...(system ? { systemInstruction: system } : {}),
      ...(request.maxOutputTokens !== undefined
        ? { maxOutputTokens: request.maxOutputTokens }
        : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(format?.type === "json"
        ? {
            responseMimeType: "application/json",
            ...(format.schema ? { responseJsonSchema: format.schema } : {}),
          }
        : {}),
      abortSignal: request.signal,
    },
  };
}

export function createGeminiProvider(client: GeminiClient): LlmProvider {
  return {
    name: "gemini",
    async generate(request: ProviderRequest): Promise<ProviderResponse> {
      const context = { provider: "gemini" as const, model: request.model };
      let response: GeminiResponse;
      try {
        response = await client.models.generateContent(toGeminiParams(request));
      } catch (err) {
        throw toAiError(err, context);
      }

      const finishReason = response.candidates?.[0]?.finishReason;
      const text = response.text ?? "";
      if (
        response.promptFeedback?.blockReason ||
        (finishReason && BLOCKED_FINISH_REASONS.has(finishReason) && !text)
      ) {
        throw new AiError("CONTENT_BLOCKED", "gemini blocked the request", context);
      }
      if (!text.trim()) {
        throw new AiError("EMPTY_RESPONSE", "gemini returned no text", context);
      }
      return {
        text,
        finishReason,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: response.usageMetadata?.candidatesTokenCount,
        },
      };
    },
  };
}

/** Builds the adapter on the real SDK. The key comes from validated config (API-01). */
export function createGeminiProviderFromKey(apiKey: string): LlmProvider {
  return createGeminiProvider(new GoogleGenAI({ apiKey }));
}
