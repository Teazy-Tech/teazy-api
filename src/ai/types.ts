/**
 * Types shared by the AI gateway and the provider adapters.
 * Only `providers/` knows about vendor SDKs; everything here is vendor-neutral.
 */

export type ProviderName = "gemini" | "openai";

export interface ModelRef {
  provider: ProviderName;
  model: string;
}

/** A piece of message content. Binary content (images, PDFs) is sent inline as base64. */
export type ContentPart =
  { type: "text"; text: string } | { type: "inline"; mimeType: string; dataBase64: string };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export type ResponseFormat =
  | { type: "text" }
  /** Ask for JSON. `schema` is a JSON Schema the provider may enforce natively. */
  | { type: "json"; name?: string; schema?: Record<string, unknown> };

/** What a caller asks the gateway for. The model comes from `routes.config.ts`. */
export interface GenerateRequest {
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  responseFormat?: ResponseFormat;
}

/** What the gateway hands to one provider for one attempt. */
export interface ProviderRequest extends GenerateRequest {
  model: string;
  signal: AbortSignal;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ProviderResponse {
  text: string;
  usage?: TokenUsage;
  finishReason?: string;
}

/** Strategy interface: one implementation per vendor in `providers/`. */
export interface LlmProvider {
  readonly name: ProviderName;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}
