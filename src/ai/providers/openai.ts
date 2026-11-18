import OpenAI from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { AiError, toAiError } from "../errors.js";
import type { ChatMessage, LlmProvider, ProviderRequest, ProviderResponse } from "../types.js";

/** The part of the OpenAI SDK this adapter uses. Tests pass a fake. */
export interface OpenAiClient {
  chat: {
    completions: {
      create(
        body: ChatCompletionCreateParamsNonStreaming,
        options?: { signal?: AbortSignal },
      ): Promise<OpenAiCompletion>;
    };
  };
}

interface OpenAiCompletion {
  choices: Array<{
    message: { content: string | null; refusal?: string | null };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
}

function textOf(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function toParts(content: Exclude<ChatMessage["content"], string>): ChatCompletionContentPart[] {
  return content.map((part): ChatCompletionContentPart => {
    if (part.type === "text") return { type: "text", text: part.text };
    const dataUrl = `data:${part.mimeType};base64,${part.dataBase64}`;
    if (part.mimeType === "application/pdf") {
      return { type: "file", file: { filename: "upload.pdf", file_data: dataUrl } };
    }
    return { type: "image_url", image_url: { url: dataUrl } };
  });
}

function toMessage(message: ChatMessage): ChatCompletionMessageParam {
  if (message.role === "system") return { role: "system", content: textOf(message.content) };
  if (message.role === "assistant") return { role: "assistant", content: textOf(message.content) };
  return {
    role: "user",
    content: typeof message.content === "string" ? message.content : toParts(message.content),
  };
}

/** JSON schema names may only use letters, digits, "_" and "-". */
function schemaName(name: string | undefined): string {
  const cleaned = (name ?? "output").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return cleaned || "output";
}

export function toOpenAiBody(request: ProviderRequest): ChatCompletionCreateParamsNonStreaming {
  const format = request.responseFormat;
  return {
    model: request.model,
    messages: request.messages.map(toMessage),
    ...(request.maxOutputTokens !== undefined
      ? { max_completion_tokens: request.maxOutputTokens }
      : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(format?.type === "json"
      ? {
          response_format: format.schema
            ? {
                type: "json_schema" as const,
                json_schema: {
                  name: schemaName(format.name),
                  schema: format.schema,
                  strict: false,
                },
              }
            : { type: "json_object" as const },
        }
      : {}),
  };
}

export function createOpenAiProvider(client: OpenAiClient): LlmProvider {
  return {
    name: "openai",
    async generate(request: ProviderRequest): Promise<ProviderResponse> {
      const context = { provider: "openai" as const, model: request.model };
      let completion: OpenAiCompletion;
      try {
        completion = await client.chat.completions.create(toOpenAiBody(request), {
          signal: request.signal,
        });
      } catch (err) {
        throw toAiError(err, context);
      }

      const choice = completion.choices[0];
      if (choice?.message.refusal || choice?.finish_reason === "content_filter") {
        throw new AiError("CONTENT_BLOCKED", "openai refused the request", context);
      }
      const text = choice?.message.content ?? "";
      if (!text.trim()) {
        throw new AiError("EMPTY_RESPONSE", "openai returned no text", context);
      }
      return {
        text,
        finishReason: choice?.finish_reason,
        usage: {
          inputTokens: completion.usage?.prompt_tokens,
          outputTokens: completion.usage?.completion_tokens,
        },
      };
    },
  };
}

/** Builds the adapter on the real SDK. The key comes from validated config (API-01). */
export function createOpenAiProviderFromKey(apiKey: string): LlmProvider {
  // Retries and timeouts are owned by the gateway, not the SDK.
  return createOpenAiProvider(new OpenAI({ apiKey, maxRetries: 0 }));
}
