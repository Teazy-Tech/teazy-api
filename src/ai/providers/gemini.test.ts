import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { createGeminiProvider, type GeminiClient } from "./gemini.js";
import type { ProviderRequest } from "../types.js";

function fakeClient(impl: GeminiClient["models"]["generateContent"]) {
  const generateContent = vi.fn(impl);
  return { client: { models: { generateContent } } satisfies GeminiClient, generateContent };
}

const base: ProviderRequest = {
  model: "gemini-test",
  signal: new AbortController().signal,
  messages: [
    { role: "system", content: "Rules." },
    { role: "user", content: "Question" },
    { role: "assistant", content: "Earlier answer" },
    {
      role: "user",
      content: [
        { type: "text", text: "Read this page" },
        { type: "inline", mimeType: "image/png", dataBase64: "AAAA" },
      ],
    },
  ],
};

describe("Gemini adapter", () => {
  it("maps messages, limits and JSON mode onto the SDK request", async () => {
    const { client, generateContent } = fakeClient(async () => ({
      text: '{"ok":true}',
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5 },
      candidates: [{ finishReason: "STOP" }],
    }));
    const schema = { type: "object" };

    const result = await createGeminiProvider(client).generate({
      ...base,
      maxOutputTokens: 100,
      temperature: 0.2,
      responseFormat: { type: "json", schema },
    });

    expect(result).toEqual({
      text: '{"ok":true}',
      finishReason: "STOP",
      usage: { inputTokens: 12, outputTokens: 5 },
    });
    const params = generateContent.mock.calls[0]![0];
    expect(params.model).toBe("gemini-test");
    expect(params.contents).toEqual([
      { role: "user", parts: [{ text: "Question" }] },
      { role: "model", parts: [{ text: "Earlier answer" }] },
      {
        role: "user",
        parts: [
          { text: "Read this page" },
          { inlineData: { mimeType: "image/png", data: "AAAA" } },
        ],
      },
    ]);
    expect(params.config).toMatchObject({
      systemInstruction: "Rules.",
      maxOutputTokens: 100,
      temperature: 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      abortSignal: base.signal,
    });
  });

  it("maps an SDK ApiError status to a typed error", async () => {
    const { client } = fakeClient(async () => {
      throw new ApiError({ message: "quota", status: 429 });
    });
    await expect(createGeminiProvider(client).generate(base)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      provider: "gemini",
      status: 429,
    });
  });

  it("reports blocked prompts as CONTENT_BLOCKED", async () => {
    const { client } = fakeClient(async () => ({ promptFeedback: { blockReason: "SAFETY" } }));
    await expect(createGeminiProvider(client).generate(base)).rejects.toMatchObject({
      code: "CONTENT_BLOCKED",
    });
  });

  it("reports an empty answer as EMPTY_RESPONSE", async () => {
    const { client } = fakeClient(async () => ({ text: "  " }));
    await expect(createGeminiProvider(client).generate(base)).rejects.toMatchObject({
      code: "EMPTY_RESPONSE",
    });
  });
});
