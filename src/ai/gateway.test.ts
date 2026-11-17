import { describe, expect, it } from "vitest";
import { AiError } from "./errors.js";
import { createAiGateway, type AttemptEvent } from "./gateway.js";
import { createFakeProvider } from "./providers/fake.js";
import { AI_ROUTES, type AiRoutes, type TaskRoute } from "./routes.config.js";
import type { GenerateRequest } from "./types.js";

const route: TaskRoute = {
  primary: { provider: "gemini", model: "primary-model" },
  fallback: { provider: "openai", model: "fallback-model" },
  maxOutputTokens: 256,
  timeoutMs: 50,
};
const routes = Object.fromEntries(Object.keys(AI_ROUTES).map((task) => [task, route])) as AiRoutes;

const request: GenerateRequest = {
  messages: [
    { role: "system", content: "You write quizzes." },
    { role: "user", content: "Synthetic lesson text about fractions." },
  ],
};

describe("AI gateway: primary and fallback", () => {
  it("returns the primary answer and never calls the fallback", async () => {
    const gemini = createFakeProvider("gemini", ["primary answer"]);
    const openai = createFakeProvider("openai", ["fallback answer"]);
    const gateway = createAiGateway({ providers: { gemini, openai }, routes });

    const result = await gateway.generate("quiz", request);

    expect(result.text).toBe("primary answer");
    expect(result).toMatchObject({
      provider: "gemini",
      model: "primary-model",
      usedFallback: false,
    });
    expect(openai.calls).toHaveLength(0);
    expect(gemini.calls[0]).toMatchObject({ model: "primary-model", maxOutputTokens: 256 });
  });

  it.each([
    ["5xx", new AiError("UNAVAILABLE", "down", { status: 503 })],
    ["429", new AiError("RATE_LIMITED", "slow down", { status: 429 })],
    ["bad key", new AiError("AUTH_FAILED", "no", { status: 401 })],
    ["empty answer", new AiError("EMPTY_RESPONSE", "nothing")],
    ["blocked content", new AiError("CONTENT_BLOCKED", "blocked")],
  ])("falls back when the primary fails with %s", async (_label, failure) => {
    const gemini = createFakeProvider("gemini", [failure]);
    const openai = createFakeProvider("openai", ["fallback answer"]);
    const gateway = createAiGateway({ providers: { gemini, openai }, routes });

    const result = await gateway.generate("quiz", request);

    expect(result.text).toBe("fallback answer");
    expect(result.usedFallback).toBe(true);
    expect(result.provider).toBe("openai");
    expect(result.failures).toEqual([
      expect.objectContaining({ provider: "gemini", code: failure.code }),
    ]);
  });

  it("falls back when the primary throws a raw SDK error", async () => {
    const sdkError = Object.assign(new Error("Service Unavailable"), { status: 503 });
    const gemini = createFakeProvider("gemini", [
      () => {
        throw sdkError;
      },
    ]);
    const openai = createFakeProvider("openai", ["fallback answer"]);
    const gateway = createAiGateway({ providers: { gemini, openai }, routes });

    const result = await gateway.generate("quiz", request);

    expect(result.text).toBe("fallback answer");
    expect(result.failures[0]).toMatchObject({ code: "UNAVAILABLE", status: 503 });
  });

  it("times out a primary that never answers and uses the fallback", async () => {
    const gemini = createFakeProvider("gemini", ["hang"]);
    const openai = createFakeProvider("openai", ["fallback answer"]);
    const gateway = createAiGateway({ providers: { gemini, openai }, routes });

    const result = await gateway.generate("quiz", request);

    expect(result.text).toBe("fallback answer");
    expect(result.failures[0]?.code).toBe("TIMEOUT");
    expect(gemini.calls[0]?.signal.aborted).toBe(true);
  });

  it("times out a provider that ignores the abort signal", async () => {
    const gemini = createFakeProvider("gemini", [() => new Promise(() => undefined)]);
    const openai = createFakeProvider("openai", ["fallback answer"]);
    const gateway = createAiGateway({ providers: { gemini, openai }, routes });

    await expect(gateway.generate("quiz", request)).resolves.toMatchObject({
      usedFallback: true,
    });
  });

  it("uses the fallback when the primary provider has no key configured", async () => {
    const openai = createFakeProvider("openai", ["fallback answer"]);
    const gateway = createAiGateway({ providers: { openai }, routes });

    const result = await gateway.generate("quiz", request);

    expect(result.text).toBe("fallback answer");
    expect(result.failures[0]?.code).toBe("NOT_CONFIGURED");
  });

  it("throws PROVIDER_UNAVAILABLE with every failure when both models fail", async () => {
    const gemini = createFakeProvider("gemini", [new AiError("UNAVAILABLE", "down")]);
    const openai = createFakeProvider("openai", ["hang"]);
    const gateway = createAiGateway({ providers: { gemini, openai }, routes });

    const error = await gateway.generate("quiz", request).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect((error as AiError).attempts.map((a) => a.code)).toEqual(["UNAVAILABLE", "TIMEOUT"]);
  });

  it("stops without falling back when the caller cancels", async () => {
    const gemini = createFakeProvider("gemini", ["hang"]);
    const openai = createFakeProvider("openai", ["fallback answer"]);
    const gateway = createAiGateway({
      providers: { gemini, openai },
      routes: { ...routes, quiz: { ...route, timeoutMs: 5_000 } },
    });
    const controller = new AbortController();

    const pending = gateway.generate("quiz", request, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
    expect(openai.calls).toHaveLength(0);
  });

  it("reports each attempt without any prompt or output text", async () => {
    const events: AttemptEvent[] = [];
    const gemini = createFakeProvider("gemini", [
      new AiError("RATE_LIMITED", "busy", { status: 429 }),
    ]);
    const openai = createFakeProvider("openai", ["fallback answer"]);
    const gateway = createAiGateway({
      providers: { gemini, openai },
      routes,
      onAttempt: (event) => events.push(event),
    });

    await gateway.generate("quiz", request);

    expect(events).toEqual([
      expect.objectContaining({
        role: "primary",
        ok: false,
        errorCode: "RATE_LIMITED",
        status: 429,
      }),
      expect.objectContaining({ role: "fallback", ok: true }),
    ]);
    const logged = JSON.stringify(events);
    expect(logged).not.toContain("fractions");
    expect(logged).not.toContain("fallback answer");
  });
});

describe("routes.config", () => {
  it("gives every task a fallback on a different provider and sane limits", () => {
    for (const [task, config] of Object.entries(AI_ROUTES)) {
      expect(config.fallback.provider, task).not.toBe(config.primary.provider);
      expect(config.timeoutMs, task).toBeGreaterThan(0);
      expect(config.maxOutputTokens, task).toBeGreaterThan(0);
    }
  });
});
