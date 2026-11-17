import { APIError } from "openai";
import { describe, expect, it, vi } from "vitest";
import { createOpenAiProvider, type OpenAiClient } from "./openai.js";
import type { ProviderRequest } from "../types.js";

function fakeClient(impl: OpenAiClient["chat"]["completions"]["create"]) {
  const create = vi.fn(impl);
  return { client: { chat: { completions: { create } } } satisfies OpenAiClient, create };
}

const completion = (content: string | null, extra: Record<string, unknown> = {}) => ({
  choices: [{ message: { content, ...extra }, finish_reason: "stop" }],
  usage: { prompt_tokens: 9, completion_tokens: 3 },
});

const base: ProviderRequest = {
  model: "openai-test",
  signal: new AbortController().signal,
  messages: [
    { role: "system", content: "Rules." },
    {
      role: "user",
      content: [
        { type: "text", text: "Read these" },
        { type: "inline", mimeType: "image/jpeg", dataBase64: "BBBB" },
        { type: "inline", mimeType: "application/pdf", dataBase64: "CCCC" },
      ],
    },
  ],
};

describe("OpenAI adapter", () => {
  it("maps messages, limits and JSON schema onto the SDK request", async () => {
    const { client, create } = fakeClient(async () => completion('{"ok":true}'));
    const schema = { type: "object" };

    const result = await createOpenAiProvider(client).generate({
      ...base,
      maxOutputTokens: 100,
      responseFormat: { type: "json", name: "quiz output", schema },
    });

    expect(result).toEqual({
      text: '{"ok":true}',
      finishReason: "stop",
      usage: { inputTokens: 9, outputTokens: 3 },
    });
    const [body, options] = create.mock.calls[0]!;
    expect(body).toEqual({
      model: "openai-test",
      max_completion_tokens: 100,
      messages: [
        { role: "system", content: "Rules." },
        {
          role: "user",
          content: [
            { type: "text", text: "Read these" },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,BBBB" } },
            {
              type: "file",
              file: { filename: "upload.pdf", file_data: "data:application/pdf;base64,CCCC" },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "quiz_output", schema, strict: false },
      },
    });
    expect(options).toEqual({ signal: base.signal });
  });

  it("uses JSON object mode when no schema is given", async () => {
    const { client, create } = fakeClient(async () => completion("{}"));
    await createOpenAiProvider(client).generate({ ...base, responseFormat: { type: "json" } });
    expect(create.mock.calls[0]![0].response_format).toEqual({ type: "json_object" });
  });

  it("maps an SDK APIError status to a typed error", async () => {
    const { client } = fakeClient(async () => {
      throw new APIError(503, undefined, "overloaded", undefined);
    });
    await expect(createOpenAiProvider(client).generate(base)).rejects.toMatchObject({
      code: "UNAVAILABLE",
      provider: "openai",
      status: 503,
    });
  });

  it("reports a refusal as CONTENT_BLOCKED", async () => {
    const { client } = fakeClient(async () => completion(null, { refusal: "no" }));
    await expect(createOpenAiProvider(client).generate(base)).rejects.toMatchObject({
      code: "CONTENT_BLOCKED",
    });
  });

  it("reports an empty answer as EMPTY_RESPONSE", async () => {
    const { client } = fakeClient(async () => completion(""));
    await expect(createOpenAiProvider(client).generate(base)).rejects.toMatchObject({
      code: "EMPTY_RESPONSE",
    });
  });
});
