# src/ai

Owner: Goodness. Every AI call in the API goes through `gateway.ts` (README rule 6).

| File                   | Task  | What it is                                                                                |
| ---------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `gateway.ts`           | AI-01 | `createAiGateway({ providers })` → `generate(task, request)`; primary, then fallback      |
| `routes.config.ts`     | AI-01 | Task → primary and fallback model, output token budget, timeout per attempt               |
| `types.ts`             | AI-01 | Vendor-neutral messages, requests, responses and the `LlmProvider` interface              |
| `errors.ts`            | AI-01 | `AiError` with a typed `code`; `toAiError` maps SDK errors by HTTP status                 |
| `structured.ts`        | AI-03 | JSON extraction, generic repair (fences, trailing commas), Zod validation, retry message  |
| `providers/`           | AI-01 | `gemini.ts`, `openai.ts` (the only files that import vendor SDKs), `fake.ts` for tests    |
| `prompts/<task>/vN.md` | AI-00 | Versioned prompts; `prompts/README.md` is the inventory of legacy prompts and model calls |
| `evals/cases/`         | AI-00 | 20 to 30 synthetic cases per task for AI-04                                               |

## Using the gateway

```ts
const gateway = createAiGateway({
  providers: createProviders({ geminiApiKey, openaiApiKey }), // keys from config/env.ts
  onAttempt: (event) => logger.info(event, "ai attempt"), // no prompt or output in the event
});

const result = await gateway.generate("quiz", {
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
});
// result.text, result.provider, result.model, result.usedFallback, result.usage
```

## Failure behaviour

- Each attempt has the route's `timeoutMs`. A provider that ignores the abort signal still times out.
- Any failure of the primary (timeout, 429, 5xx, bad key, empty or blocked answer, provider not configured) moves on to the fallback.
- If the caller cancels (`signal`), the gateway stops and does not try the fallback.
- If both models fail, `generate` throws `AiError` with code `PROVIDER_UNAVAILABLE` and the list of failed attempts. Map it to the API error `PROVIDER_UNAVAILABLE` once `core/errors.ts` exists (API-02).
- Error messages and attempt events never contain prompts, student text, model output or keys.

## Structured output (AI-03, first half)

```ts
const { data, retried } = await gateway.generateStructured("quiz", QuizSchema, request, {
  repair: normaliseQuiz, // optional, task-specific, pure
});
```

1. Asks the provider for JSON (with the JSON Schema generated from the Zod schema where the provider supports it).
2. Strips code fences and surrounding text, fixes trailing commas, runs the optional `repair`, then validates with Zod.
3. If invalid, retries once with the reply and the validation errors (paths and messages only) attached.
4. If still invalid, throws `AiError` `INVALID_OUTPUT` with the issues. Provider failures still fall back as in `generate`.

Still to do in week 2: retry with jitter and a circuit breaker in `decorators/`, so that once a model keeps failing its traffic goes straight to the fallback.
