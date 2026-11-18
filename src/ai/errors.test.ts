import { describe, expect, it } from "vitest";
import { AiError, codeForStatus, toAiError } from "./errors.js";

describe("toAiError", () => {
  it.each([
    [429, "RATE_LIMITED"],
    [401, "AUTH_FAILED"],
    [403, "AUTH_FAILED"],
    [400, "BAD_REQUEST"],
    [404, "BAD_REQUEST"],
    [408, "TIMEOUT"],
    [500, "UNAVAILABLE"],
    [503, "UNAVAILABLE"],
  ])("maps HTTP %i to %s", (status, code) => {
    expect(codeForStatus(status)).toBe(code);
  });

  it("treats an error without a status as a network failure", () => {
    const error = toAiError(new TypeError("fetch failed"), { provider: "openai", model: "m" });
    expect(error.code).toBe("UNAVAILABLE");
    expect(error.provider).toBe("openai");
  });

  it("keeps vendor error text out of the message", () => {
    const vendor = Object.assign(new Error("prompt: synthetic student essay ..."), { status: 400 });
    const error = toAiError(vendor, { provider: "gemini", model: "m" });
    expect(error.message).toBe("gemini/m request failed with status 400");
    expect(error.cause).toBe(vendor);
  });

  it("returns an AiError unchanged", () => {
    const original = new AiError("TIMEOUT", "slow");
    expect(toAiError(original, { provider: "gemini", model: "m" })).toBe(original);
  });
});
