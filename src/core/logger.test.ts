import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("defaults to info and respects the silent level", () => {
    expect(createLogger().level).toBe("info");
    expect(createLogger({ level: "silent" }).level).toBe("silent");
  });
});
