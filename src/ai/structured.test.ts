import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiError } from "./errors.js";
import { createAiGateway } from "./gateway.js";
import { createFakeProvider } from "./providers/fake.js";
import { AI_ROUTES, type AiRoutes, type TaskRoute } from "./routes.config.js";
import { extractJson, parseStructured, toProviderSchema } from "./structured.js";
import type { GenerateRequest } from "./types.js";

const route: TaskRoute = {
  primary: { provider: "gemini", model: "primary-model" },
  fallback: { provider: "openai", model: "fallback-model" },
  maxOutputTokens: 256,
  timeoutMs: 50,
};
const routes = Object.fromEntries(Object.keys(AI_ROUTES).map((task) => [task, route])) as AiRoutes;

const Quiz = z.object({
  multipleChoice: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string() }),
        answer: z.enum(["A", "B", "C", "D"]),
      }),
    )
    .min(1),
  shortAnswer: z.array(z.object({ question: z.string(), answer: z.string() })),
});

const validQuiz = {
  multipleChoice: [
    {
      question: "What is 1/2 + 1/4?",
      options: { A: "3/4", B: "2/6", C: "1/8", D: "2/4" },
      answer: "A",
    },
  ],
  shortAnswer: [{ question: "Name the top number of a fraction.", answer: "Numerator" }],
};
const validJson = JSON.stringify(validQuiz);
const invalidJson = JSON.stringify({
  ...validQuiz,
  multipleChoice: [{ question: "?", answer: "E" }],
});

const request: GenerateRequest = {
  messages: [
    { role: "system", content: "Quiz generator. Output only JSON." },
    { role: "user", content: "Synthetic lesson about fractions." },
  ],
};

describe("extractJson and parseStructured", () => {
  it("strips code fences and surrounding text", () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nThanks')).toBe('{"a":1}');
    expect(extractJson("[1,2]")).toBe("[1,2]");
  });

  it("repairs trailing commas", () => {
    const outcome = parseStructured('{"a": [1, 2,],}', z.object({ a: z.array(z.number()) }));
    expect(outcome).toEqual({ ok: true, data: { a: [1, 2] } });
  });

  it("applies the task repair before validating", () => {
    const schema = z.object({ totalMarks: z.number() });
    const repair = (value: unknown) => ({ ...(value as object), totalMarks: 10 });
    expect(parseStructured("{}", schema, repair)).toEqual({ ok: true, data: { totalMarks: 10 } });
  });

  it("reports paths and messages without echoing the values", () => {
    const outcome = parseStructured(
      '{"name": "synthetic pupil essay text"}',
      z.object({ name: z.number() }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues[0]).toMatch(/^name: /);
      expect(outcome.issues.join(" ")).not.toContain("synthetic pupil essay text");
    }
  });

  it("reports non-JSON replies", () => {
    expect(parseStructured("I cannot help with that.", Quiz)).toEqual({
      ok: false,
      issues: ["(root): reply is not valid JSON"],
    });
  });

  it("turns a Zod schema into a JSON Schema for the provider", () => {
    expect(toProviderSchema(Quiz)).toMatchObject({
      type: "object",
      required: ["multipleChoice", "shortAnswer"],
    });
  });
});

describe("gateway.generateStructured", () => {
  it("returns validated data on the first try and asks for JSON", async () => {
    const gemini = createFakeProvider("gemini", ["```json\n" + validJson + "\n```"]);
    const gateway = createAiGateway({ providers: { gemini }, routes });

    const out = await gateway.generateStructured("quiz", Quiz, request);

    expect(out.data).toEqual(validQuiz);
    expect(out.retried).toBe(false);
    expect(gemini.calls[0]?.responseFormat).toMatchObject({ type: "json", name: "quiz" });
  });

  it("retries once with the validation errors attached, then succeeds", async () => {
    const gemini = createFakeProvider("gemini", [invalidJson, validJson]);
    const gateway = createAiGateway({ providers: { gemini }, routes });

    const out = await gateway.generateStructured("quiz", Quiz, request);

    expect(out.data).toEqual(validQuiz);
    expect(out.retried).toBe(true);
    expect(gemini.calls).toHaveLength(2);
    const retryMessages = gemini.calls[1]!.messages;
    expect(retryMessages.at(-2)).toEqual({ role: "assistant", content: invalidJson });
    expect(retryMessages.at(-1)?.content).toContain("multipleChoice.0.answer");
  });

  it("throws INVALID_OUTPUT after exactly one retry", async () => {
    const gemini = createFakeProvider("gemini", ["not json", invalidJson, validJson]);
    const gateway = createAiGateway({ providers: { gemini }, routes });

    const error = await gateway.generateStructured("quiz", Quiz, request).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "INVALID_OUTPUT", provider: "gemini" });
    expect((error as AiError).issues.length).toBeGreaterThan(0);
    expect(gemini.calls).toHaveLength(2);
  });

  it("uses the fallback model when the primary provider fails", async () => {
    const gemini = createFakeProvider("gemini", [
      new AiError("UNAVAILABLE", "down", { status: 503 }),
    ]);
    const openai = createFakeProvider("openai", [validJson]);
    const gateway = createAiGateway({ providers: { gemini, openai }, routes });

    const out = await gateway.generateStructured("quiz", Quiz, request);

    expect(out.data).toEqual(validQuiz);
    expect(out.result).toMatchObject({ provider: "openai", usedFallback: true });
  });

  it("passes provider outages through as PROVIDER_UNAVAILABLE, not INVALID_OUTPUT", async () => {
    const gemini = createFakeProvider("gemini", ["hang"]);
    const openai = createFakeProvider("openai", [
      new AiError("RATE_LIMITED", "busy", { status: 429 }),
    ]);
    const gateway = createAiGateway({ providers: { gemini, openai }, routes });

    await expect(gateway.generateStructured("quiz", Quiz, request)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });
});
